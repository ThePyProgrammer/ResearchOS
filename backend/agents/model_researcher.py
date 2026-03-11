"""
Model Researcher workflow (wf2).

Given a machine-learning problem statement, this agent:
1. Decomposes the task into ML categories and properties (GPT-4o).
2. Generates an arXiv search query from the analysis (GPT-4o-mini).
3. Fetches and scores candidate papers (GPT-4o-mini).
4. Synthesises a structured model-suggestion report (GPT-4o).
5. Proposes relevant papers for the library and stores the report in the run logs.
"""

import json
import logging
from typing import Optional

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from agents.base import RunLogger, emit_activity, search_arxiv
from agents.llm import get_pydantic_ai_model
from agents.prompts import MODEL_RESEARCH_ANALYSIS, MODEL_RESEARCH_SCREENING, MODEL_RESEARCH_SUGGESTION
from models.paper import AgentRunRef, PaperCreate
from services import paper_service, proposal_service, run_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Output schemas
# ---------------------------------------------------------------------------

class TaskAnalysisOutput(BaseModel):
    task_type: str = Field(description="Primary ML task type, e.g. classification, detection")
    modality: str = Field(description="Data modality, e.g. text, image, time-series")
    key_requirements: list[str] = Field(
        description="List of key requirements/constraints, e.g. real-time, low-memory"
    )
    search_query: str = Field(
        description=(
            "A single arXiv search query with slash-separated terms (max 4), "
            "e.g. 'transformer/object detection/real-time'"
        )
    )
    analysis_summary: str = Field(
        description="2–3 sentence summary of the task analysis"
    )


class PaperScore(BaseModel):
    arxiv_id: str
    relevance: int = Field(ge=0, le=10)
    reasoning: str
    tags: list[str] = Field(default_factory=list)


class PaperScreeningOutput(BaseModel):
    scores: list[PaperScore]


class ModelSuggestion(BaseModel):
    model_name: str = Field(description="Name of the recommended model/architecture")
    rationale: str = Field(description="Why this model suits the task")
    strengths: list[str]
    limitations: list[str]
    implementation_notes: str = Field(
        description="Practical implementation guidance"
    )
    relevant_papers: list[str] = Field(description="arXiv IDs of supporting papers")


class ModelSuggestionsOutput(BaseModel):
    suggestions: list[ModelSuggestion] = Field(
        description="Top 3–5 model recommendations ordered by suitability"
    )
    synthesis: str = Field(
        description="Overall synthesis paragraph comparing the recommendations"
    )


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

def _make_analysis_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=TaskAnalysisOutput,
        system_prompt=MODEL_RESEARCH_ANALYSIS,
        defer_model_check=True,
    )

def _make_screening_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent_light"),
        output_type=PaperScreeningOutput,
        system_prompt=MODEL_RESEARCH_SCREENING,
        defer_model_check=True,
    )

def _make_suggestion_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent"),
        output_type=ModelSuggestionsOutput,
        system_prompt=MODEL_RESEARCH_SUGGESTION,
        defer_model_check=True,
    )

# ---------------------------------------------------------------------------
# Workflow runner
# ---------------------------------------------------------------------------

_RELEVANCE_THRESHOLD = 6
_BATCH_SIZE = 15


async def run_model_researcher(
    run_id: str,
    prompt: str,
    target_collection_id: Optional[str] = None,
) -> None:
    """Execute the Model Researcher workflow end-to-end as a background task."""
    log = RunLogger(run_id)
    log.info("Model Researcher started")
    log.info(f"Prompt: {prompt[:300]}")
    log.set_progress(5, "Initializing (Step 0/5)")

    trace: list[dict] = []

    try:
        # ── Step 1: Task decomposition ────────────────────────────────────────
        log.set_progress(10, "Analysing task (Step 1/5)")
        log.agent("Decomposing ML task into categories and properties…")

        analysis_result = await _make_analysis_agent().run(
            f"ML Problem: {prompt}\n\nDecompose this task and generate a search query."
        )
        analysis = analysis_result.output
        log.info(
            f"Task type: {analysis.task_type} | Modality: {analysis.modality}"
        )
        log.info(f"Requirements: {', '.join(analysis.key_requirements)}")
        log.info(f"Search query: {analysis.search_query}")
        log.agent(f"Analysis: {analysis.analysis_summary}")

        trace.append(
            {
                "step": "Task Decomposition",
                "status": "done",
                "detail": (
                    f"Task: {analysis.task_type} on {analysis.modality}; "
                    f"{len(analysis.key_requirements)} key requirements identified"
                ),
            }
        )

        # ── Step 2: Literature search ─────────────────────────────────────────
        log.set_progress(25, "Searching literature (Step 2/5)")
        log.tool(f'Call arXiv API (query="{analysis.search_query}", limit=50)')

        papers_raw = await search_arxiv(analysis.search_query, max_results=50)

        # Supplement with a broader fallback if fewer than 10 results
        if len(papers_raw) < 10:
            fallback = f"{analysis.task_type}/{analysis.modality}/deep learning"
            log.tool(f'Call arXiv API fallback (query="{fallback}", limit=30)')
            fallback_papers = await search_arxiv(fallback, max_results=30)
            seen = {p["arxiv_id"] for p in papers_raw}
            for p in fallback_papers:
                if p["arxiv_id"] not in seen:
                    papers_raw.append(p)
                    seen.add(p["arxiv_id"])

        log.info(f"Retrieved {len(papers_raw)} candidate papers")

        trace.append(
            {
                "step": "Literature Search",
                "status": "done",
                "detail": f"Retrieved {len(papers_raw)} candidate papers from arXiv",
            }
        )

        if not papers_raw:
            log.error("No papers found")
            run_service.complete_run(run_id, trace)
            return

        # ── Step 3: Paper validation ──────────────────────────────────────────
        log.set_progress(45, "Validating papers (Step 3/5)")
        log.agent(f"Screening {len(papers_raw)} papers for model-architecture relevance…")

        papers_by_id = {p["arxiv_id"]: p for p in papers_raw}
        all_scores: dict[str, PaperScore] = {}
        n_batches = (len(papers_raw) + _BATCH_SIZE - 1) // _BATCH_SIZE

        for batch_idx in range(n_batches):
            batch = papers_raw[batch_idx * _BATCH_SIZE : (batch_idx + 1) * _BATCH_SIZE]
            papers_text = "".join(
                f"[{i}] arxiv_id={p['arxiv_id']}\nTitle: {p['title']}\n"
                f"Abstract: {p['abstract'][:400]}\n\n"
                for i, p in enumerate(batch, 1)
            )
            log.agent(
                f"Screening batch {batch_idx + 1}/{n_batches} ({len(batch)} papers)…"
            )
            result = await _make_screening_agent().run(
                f"ML task: {prompt}\n\nPapers:\n{papers_text}"
            )
            for score in result.output.scores:
                all_scores[score.arxiv_id] = score

        relevant = sorted(
            [s for s in all_scores.values() if s.relevance >= _RELEVANCE_THRESHOLD],
            key=lambda s: s.relevance,
            reverse=True,
        )
        log.info(
            f"Validation complete: {len(relevant)} relevant papers "
            f"(score ≥ {_RELEVANCE_THRESHOLD})"
        )

        trace.append(
            {
                "step": "Paper Validation",
                "status": "done",
                "detail": f"Validated {len(relevant)} relevant papers",
            }
        )

        # ── Step 4: Generate model suggestions ────────────────────────────────
        log.set_progress(65, "Generating model suggestions (Step 4/5)")
        log.agent("Synthesising model recommendations from literature…")

        top_papers = relevant[:8]
        literature_summary = "\n".join(
            f"- [{s.arxiv_id}] {papers_by_id[s.arxiv_id]['title']} "
            f"(score={s.relevance}): {papers_by_id[s.arxiv_id]['abstract'][:300]}"
            for s in top_papers
            if s.arxiv_id in papers_by_id
        )

        suggestion_result = await _make_suggestion_agent().run(
            f"ML Problem: {prompt}\n\n"
            f"Task Analysis:\n"
            f"- Type: {analysis.task_type}\n"
            f"- Modality: {analysis.modality}\n"
            f"- Requirements: {', '.join(analysis.key_requirements)}\n\n"
            f"Relevant Literature:\n{literature_summary}\n\n"
            "Recommend the top 3–5 model architectures for this problem."
        )
        suggestions = suggestion_result.output

        log.agent(
            f"Generated {len(suggestions.suggestions)} model recommendations"
        )
        for s in suggestions.suggestions:
            log.info(f"  → {s.model_name}: {s.rationale[:120]}")

        # Log the synthesis report to the run record
        log.info("--- MODEL SUGGESTIONS REPORT ---")
        for i, s in enumerate(suggestions.suggestions, 1):
            log.info(
                f"{i}. {s.model_name}\n"
                f"   Rationale: {s.rationale}\n"
                f"   Strengths: {'; '.join(s.strengths)}\n"
                f"   Limitations: {'; '.join(s.limitations)}\n"
                f"   Notes: {s.implementation_notes}"
            )
        log.info(f"Synthesis: {suggestions.synthesis}")

        trace.append(
            {
                "step": "Model Suggestions",
                "status": "done",
                "detail": (
                    f"Generated {len(suggestions.suggestions)} model recommendations"
                ),
            }
        )

        # ── Step 5: Create paper + proposal records ───────────────────────────
        log.set_progress(85, "Creating proposals (Step 5/5)")

        run = run_service.get_run(run_id)
        run_name = run.workflow_name if run else "Model Researcher"
        proposal_count = 0

        for score in relevant[:10]:  # Propose top 10 most relevant papers
            paper_data = papers_by_id.get(score.arxiv_id)
            if not paper_data:
                continue

            existing = [
                p for p in paper_service.list_papers() if p.arxiv_id == score.arxiv_id
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
                        arxiv_id=score.arxiv_id,
                        status="inbox",
                        tags=score.tags[:5],
                        abstract=paper_data["abstract"][:2000],
                        source="agent",
                        agent_run=AgentRunRef(id=run_id, name=run_name, run_number=0),
                        relevance_score=score.relevance,
                        agent_reasoning=score.reasoning,
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
                "detail": f"Proposed {proposal_count} papers — pending user review",
            }
        )

        log.set_progress(100, "Complete")
        run_service.complete_run(run_id, trace)

        emit_activity(
            run_id=run_id,
            title=f"{run_name} completed",
            detail=(
                f"Suggested {len(suggestions.suggestions)} models; "
                f"proposed {proposal_count} papers"
            ),
            icon="psychology",
            icon_color="text-purple-600",
            icon_bg="bg-purple-100",
            action_label="Review & Approve",
            action_href="/proposals",
        )

    except Exception as exc:
        logger.exception("Model Researcher workflow %s failed", run_id)
        log.error(f"Workflow failed: {exc}")
        run_service.fail_run(run_id, str(exc))
