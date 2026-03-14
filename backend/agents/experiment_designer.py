"""
Experiment Designer workflow (wf3).

Given a research plan or problem description, this agent:
1. Extracts goals, hypotheses, and constraints from the input (GPT-4o).
2. Retrieves supporting literature from arXiv (hybrid query approach).
3. Generates experiment ideas and selects the best one (GPT-4o).
4. Runs a critique-and-refinement loop (up to 2 iterations, GPT-4o).
5. Generates a detailed experiment design + minimal executable Python code (GPT-4o).
6. Logs the full design + code to the run record and proposes relevant papers.
"""

import logging
from typing import Optional

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from agents.base import RunLogger, emit_activity, search_arxiv
from agents.llm import get_model, get_pydantic_ai_model
from agents.prompts import (
    EXPERIMENT_GOAL_EXTRACTION,
    EXPERIMENT_IDEA_GEN,
    EXPERIMENT_CRITIQUE,
    EXPERIMENT_DESIGN,
    EXPERIMENT_CODE_GEN,
)
from models.paper import AgentRunRef, PaperCreate
from services import paper_service, proposal_service, run_service
from services.cost_service import RunCostTracker, record_openai_usage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Output schemas
# ---------------------------------------------------------------------------

class GoalExtractionOutput(BaseModel):
    goals: list[str] = Field(description="Primary research goals")
    hypotheses: list[str] = Field(description="Testable hypotheses to investigate")
    constraints: list[str] = Field(
        description="Resource or scope constraints (budget, time, data availability)"
    )
    arxiv_queries: list[str] = Field(
        description=(
            "2–3 arXiv search queries (slash-separated, max 4 terms each) "
            "for retrieving relevant methodology papers"
        )
    )
    domain: str = Field(description="Research domain, e.g. NLP, computer vision, robotics")


class ExperimentIdea(BaseModel):
    name: str
    description: str
    methodology: str
    datasets: list[str]
    expected_outcome: str
    novelty_score: int = Field(ge=1, le=10, description="Estimated novelty 1–10")
    feasibility_score: int = Field(ge=1, le=10, description="Estimated feasibility 1–10")


class ExperimentIdeasOutput(BaseModel):
    ideas: list[ExperimentIdea] = Field(description="3–5 experiment ideas")
    selected_idea_index: int = Field(
        description="0-based index of the best idea (highest novelty×feasibility)"
    )


class CritiqueOutput(BaseModel):
    overall_score: int = Field(ge=1, le=10)
    strengths: list[str]
    major_issues: list[str]
    suggestions: list[str]
    pass_threshold: bool = Field(description="True if score ≥ 7 and no blocking issues")


class ExperimentDesignOutput(BaseModel):
    title: str
    objective: str
    methodology: str = Field(description="Step-by-step methodology")
    datasets: list[str]
    baselines: list[str]
    evaluation_metrics: list[str]
    implementation_plan: str
    expected_outcomes: str
    references: list[str] = Field(description="arXiv IDs cited in this design")


class CodeOutput(BaseModel):
    code: str = Field(
        description=(
            "Minimal, executable Python code stub for the experiment. "
            "Include all necessary imports, data loading, model definition, "
            "training loop, and evaluation. Add TODO comments for sections "
            "requiring dataset-specific implementation."
        )
    )
    setup_instructions: str = Field(
        description="pip install commands and environment setup notes"
    )


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

def _make_goal_extraction_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=GoalExtractionOutput,
        system_prompt=EXPERIMENT_GOAL_EXTRACTION,
        defer_model_check=True,
    )

def _make_idea_gen_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=ExperimentIdeasOutput,
        system_prompt=EXPERIMENT_IDEA_GEN,
        defer_model_check=True,
    )

def _make_critique_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=CritiqueOutput,
        system_prompt=EXPERIMENT_CRITIQUE,
        defer_model_check=True,
    )

def _make_design_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=ExperimentDesignOutput,
        system_prompt=EXPERIMENT_DESIGN,
        defer_model_check=True,
    )

def _make_code_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=CodeOutput,
        system_prompt=EXPERIMENT_CODE_GEN,
        defer_model_check=True,
    )

# ---------------------------------------------------------------------------
# Workflow runner
# ---------------------------------------------------------------------------

_MAX_CRITIQUE_ROUNDS = 2
_RELEVANCE_THRESHOLD = 5
_BATCH_SIZE = 15


async def run_experiment_designer(
    run_id: str,
    prompt: str,
    target_collection_id: Optional[str] = None,
) -> None:
    """Execute the Experiment Designer workflow end-to-end as a background task."""
    log = RunLogger(run_id)
    log.info("Experiment Designer started")
    log.info(f"Input: {prompt[:300]}")
    log.set_progress(5, "Initializing (Step 0/6)")

    trace: list[dict] = []
    tracker = RunCostTracker()

    try:
        # ── Step 1: Extract goals ─────────────────────────────────────────────
        log.set_progress(8, "Extracting goals (Step 1/6)")
        log.agent("Extracting research goals, hypotheses, and constraints…")

        goals_result = await _make_goal_extraction_agent().run(
            f"Research plan / problem description:\n{prompt}"
        )
        tracker.add_llm(goals_result.usage(), get_model("agent"))
        record_openai_usage(goals_result.usage(), get_model("agent"))
        goals = goals_result.output
        log.info(f"Domain: {goals.domain}")
        log.info(f"Goals: {'; '.join(goals.goals)}")
        log.info(f"Hypotheses: {'; '.join(goals.hypotheses)}")
        log.info(f"Constraints: {'; '.join(goals.constraints)}")

        trace.append(
            {
                "step": "Goal Extraction",
                "status": "done",
                "detail": (
                    f"Domain: {goals.domain}; "
                    f"{len(goals.goals)} goals, {len(goals.hypotheses)} hypotheses"
                ),
            }
        )

        # ── Step 2: Retrieve supporting literature ────────────────────────────
        log.set_progress(15, "Retrieving literature (Step 2/6)")

        all_papers: dict[str, dict] = {}
        for q in goals.arxiv_queries:
            log.tool(f'Call arXiv API (query="{q}", limit=30)')
            fetched = await search_arxiv(q, max_results=30)
            tracker.add_api_calls("arXiv")
            for p in fetched:
                if p["arxiv_id"] not in all_papers:
                    all_papers[p["arxiv_id"]] = p
            log.info(f'arXiv "{q}": {len(fetched)} retrieved (total: {len(all_papers)})')

        papers_list = list(all_papers.values())
        log.info(f"Total unique papers: {len(papers_list)}")

        trace.append(
            {
                "step": "RAG Context",
                "status": "done",
                "detail": f"Retrieved {len(papers_list)} supporting papers",
            }
        )

        # Build literature context string for downstream agents
        literature_context = "\n".join(
            f"[{p['arxiv_id']}] {p['title']}: {p['abstract'][:350]}"
            for p in papers_list[:12]
        )

        # ── Step 3: Generate experiment ideas ─────────────────────────────────
        log.set_progress(30, "Generating experiment ideas (Step 3/6)")
        log.agent("Generating experiment ideas grounded in literature…")

        ideas_result = await _make_idea_gen_agent().run(
            f"Research goals:\n{chr(10).join(f'- {g}' for g in goals.goals)}\n\n"
            f"Hypotheses:\n{chr(10).join(f'- {h}' for h in goals.hypotheses)}\n\n"
            f"Constraints:\n{chr(10).join(f'- {c}' for c in goals.constraints)}\n\n"
            f"Supporting literature:\n{literature_context}\n\n"
            "Generate 3–5 experiment ideas and select the best one."
        )
        tracker.add_llm(ideas_result.usage(), get_model("agent"))
        record_openai_usage(ideas_result.usage(), get_model("agent"))
        ideas_output = ideas_result.output
        log.info(f"Generated {len(ideas_output.ideas)} experiment ideas")
        for idx, idea in enumerate(ideas_output.ideas):
            log.info(
                f"  Idea {idx + 1}: {idea.name} "
                f"(novelty={idea.novelty_score}, feasibility={idea.feasibility_score})"
            )

        selected_idx = min(
            ideas_output.selected_idea_index, len(ideas_output.ideas) - 1
        )
        selected_idea = ideas_output.ideas[selected_idx]
        log.agent(f"Selected idea: {selected_idea.name}")

        trace.append(
            {
                "step": "Idea Generation",
                "status": "done",
                "detail": (
                    f"Generated {len(ideas_output.ideas)} ideas; "
                    f"selected: {selected_idea.name}"
                ),
            }
        )

        # ── Step 4: Design + critique loop ────────────────────────────────────
        log.set_progress(45, "Designing experiment (Step 4/6)")
        log.agent("Generating detailed experiment design…")

        design_prompt = (
            f"Research domain: {goals.domain}\n"
            f"Selected experiment: {selected_idea.name}\n"
            f"Description: {selected_idea.description}\n"
            f"Methodology hint: {selected_idea.methodology}\n"
            f"Datasets hint: {', '.join(selected_idea.datasets)}\n"
            f"Expected outcome: {selected_idea.expected_outcome}\n\n"
            f"Original goals:\n{chr(10).join(f'- {g}' for g in goals.goals)}\n\n"
            f"Supporting literature:\n{literature_context}"
        )

        design_result = await _make_design_agent().run(design_prompt)
        tracker.add_llm(design_result.usage(), get_model("agent"))
        record_openai_usage(design_result.usage(), get_model("agent"))
        design = design_result.output

        for round_num in range(1, _MAX_CRITIQUE_ROUNDS + 1):
            log.agent(f"Running critique round {round_num}/{_MAX_CRITIQUE_ROUNDS}…")

            critique_result = await _make_critique_agent().run(
                f"Experiment design to critique:\n\n"
                f"Title: {design.title}\n"
                f"Objective: {design.objective}\n"
                f"Methodology: {design.methodology}\n"
                f"Datasets: {', '.join(design.datasets)}\n"
                f"Baselines: {', '.join(design.baselines)}\n"
                f"Metrics: {', '.join(design.evaluation_metrics)}\n"
                f"Implementation: {design.implementation_plan}\n"
                f"Expected outcomes: {design.expected_outcomes}"
            )
            tracker.add_llm(critique_result.usage(), get_model("agent"))
            record_openai_usage(critique_result.usage(), get_model("agent"))
            critique = critique_result.output

            log.agent(
                f"Critique score: {critique.overall_score}/10 | "
                f"Pass: {critique.pass_threshold}"
            )
            if critique.major_issues:
                log.info(
                    f"Issues: {'; '.join(critique.major_issues)}"
                )
            if critique.suggestions:
                log.info(
                    f"Suggestions: {'; '.join(critique.suggestions)}"
                )

            if critique.pass_threshold:
                log.agent(f"Design passed critique at round {round_num} ✓")
                break

            # Refine design based on critique
            log.agent(f"Refining design based on critique (round {round_num})…")
            refine_prompt = (
                f"{design_prompt}\n\n"
                f"Previous design had these issues:\n"
                + "\n".join(f"- {issue}" for issue in critique.major_issues)
                + "\n\nSuggestions:\n"
                + "\n".join(f"- {s}" for s in critique.suggestions)
                + "\n\nPlease improve the design to address these issues."
            )
            design_result = await _make_design_agent().run(refine_prompt)
            tracker.add_llm(design_result.usage(), get_model("agent"))
            record_openai_usage(design_result.usage(), get_model("agent"))
            design = design_result.output

        trace.append(
            {
                "step": "Critique Loop",
                "status": "done",
                "detail": f"Design refined over {round_num} critique round(s)",
            }
        )

        # ── Step 5: Generate code ─────────────────────────────────────────────
        log.set_progress(75, "Generating code (Step 5/6)")
        log.agent("Generating Python experiment code stub…")

        code_result = await _make_code_agent().run(
            f"Generate Python code for this experiment:\n\n"
            f"Title: {design.title}\n"
            f"Objective: {design.objective}\n"
            f"Methodology: {design.methodology}\n"
            f"Datasets: {', '.join(design.datasets)}\n"
            f"Baselines: {', '.join(design.baselines)}\n"
            f"Metrics: {', '.join(design.evaluation_metrics)}\n"
            f"Implementation plan: {design.implementation_plan}"
        )
        tracker.add_llm(code_result.usage(), get_model("agent"))
        record_openai_usage(code_result.usage(), get_model("agent"))
        code_output = code_result.output

        # Log the full design and code to the run record
        log.info("=== EXPERIMENT DESIGN ===")
        log.info(f"Title: {design.title}")
        log.info(f"Objective: {design.objective}")
        log.info(f"Methodology:\n{design.methodology}")
        log.info(f"Datasets: {', '.join(design.datasets)}")
        log.info(f"Baselines: {', '.join(design.baselines)}")
        log.info(f"Metrics: {', '.join(design.evaluation_metrics)}")
        log.info(f"Implementation:\n{design.implementation_plan}")
        log.info(f"Expected outcomes: {design.expected_outcomes}")
        log.info("=== SETUP ===")
        log.info(code_output.setup_instructions)
        log.info("=== GENERATED CODE ===")
        log.info(code_output.code)

        trace.append(
            {
                "step": "Code Generation",
                "status": "done",
                "detail": "Experiment design and Python code stub generated",
            }
        )

        # ── Step 6: Create paper proposals ───────────────────────────────────
        log.set_progress(90, "Creating proposals (Step 6/6)")

        run = run_service.get_run(run_id)
        run_name = run.workflow_name if run else "Experiment Designer"
        proposal_count = 0

        # Propose papers cited in design + top-scored papers
        cited_ids = set(design.references)
        top_papers = sorted(
            papers_list,
            key=lambda p: 1 if p["arxiv_id"] in cited_ids else 0,
            reverse=True,
        )[:8]

        for paper_data in top_papers:
            existing = [
                p
                for p in paper_service.list_papers()
                if p.arxiv_id == paper_data["arxiv_id"]
            ]
            if existing:
                paper_obj = existing[0]
            else:
                paper_obj = paper_service.create_paper(
                    PaperCreate(
                        title=paper_data["title"],
                        authors=paper_data["authors"][:10],
                        year=paper_data["year"] or 2024,
                        venue="arXiv",
                        arxiv_id=paper_data["arxiv_id"],
                        status="inbox",
                        tags=[goals.domain.lower()],
                        abstract=paper_data["abstract"][:2000],
                        source="agent",
                        agent_run=AgentRunRef(id=run_id, name=run_name, run_number=0),
                        relevance_score=9 if paper_data["arxiv_id"] in cited_ids else 6,
                        agent_reasoning=(
                            "Cited in experiment design"
                            if paper_data["arxiv_id"] in cited_ids
                            else "Retrieved during literature search"
                        ),
                        collections=[target_collection_id] if target_collection_id else [],
                    )
                )
                log.info(f"Created paper: {paper_obj.title[:70]}")

            proposal_service.create_proposal(paper_obj.id, run_id)
            proposal_count += 1

        log.info(f"Created {proposal_count} proposals")

        trace.append(
            {
                "step": "Awaiting Approval",
                "status": "pending",
                "detail": f"Proposed {proposal_count} methodology papers — pending review",
            }
        )

        log.set_progress(100, "Complete")
        run_service.complete_run(run_id, trace, cost=tracker.to_cost_dict())

        emit_activity(
            run_id=run_id,
            title=f"{run_name} completed",
            detail=(
                f"Designed experiment '{design.title}'; "
                f"proposed {proposal_count} papers"
            ),
            icon="science",
            icon_color="text-orange-600",
            icon_bg="bg-orange-100",
            action_label="Review & Approve",
            action_href="/proposals",
        )

    except Exception as exc:
        logger.exception("Experiment Designer workflow %s failed", run_id)
        log.error(f"Workflow failed: {exc}")
        run_service.fail_run(run_id, str(exc))
