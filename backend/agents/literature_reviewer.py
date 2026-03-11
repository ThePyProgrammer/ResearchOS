"""
Literature Reviewer workflow (wf1).

Given a research prompt, this agent:
1. Generates targeted arXiv search queries (GPT-4o-mini).
2. Fetches candidate papers from the arXiv API.
3. Screens and scores candidates for relevance (GPT-4o-mini, batched).
4. Creates Paper records and Proposal records for relevant papers.
5. Updates the run record with live logs, progress, and a final trace.
"""

import logging
from typing import Optional

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from agents.base import RunLogger, emit_activity, search_arxiv
from agents.llm import get_pydantic_ai_model
from agents.prompts import LIT_REVIEW_QUERY_GEN, LIT_REVIEW_SCREENING
from models.paper import AgentRunRef, PaperCreate
from services import paper_service, proposal_service, run_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Output schemas for pydantic-ai agents
# ---------------------------------------------------------------------------

class SearchQueriesOutput(BaseModel):
    queries: list[str] = Field(
        description="List of 2–4 arXiv search queries, each with slash-separated terms"
    )
    reasoning: str = Field(description="Brief explanation of the query strategy")


class PaperScore(BaseModel):
    arxiv_id: str = Field(description="The arXiv ID of the paper being scored")
    relevance: int = Field(ge=0, le=10, description="Relevance score 0–10")
    reasoning: str = Field(description="One-sentence justification for the score")
    tags: list[str] = Field(
        default_factory=list,
        description="2–5 concise topic tags inferred from the paper",
    )


class ScreeningOutput(BaseModel):
    scores: list[PaperScore]


# ---------------------------------------------------------------------------
# pydantic-ai agents (module-level singletons, model loaded lazily)
# ---------------------------------------------------------------------------

def _make_query_gen_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent_light"),
        output_type=SearchQueriesOutput,
        system_prompt=LIT_REVIEW_QUERY_GEN,
        defer_model_check=True,
    )

def _make_screening_agent() -> Agent:
    return Agent(
        get_pydantic_ai_model("agent_light"),
        output_type=ScreeningOutput,
        system_prompt=LIT_REVIEW_SCREENING,
        defer_model_check=True,
    )

# ---------------------------------------------------------------------------
# Workflow runner
# ---------------------------------------------------------------------------

_RELEVANCE_THRESHOLD = 6
_BATCH_SIZE = 15  # papers per screening LLM call


async def run_literature_reviewer(
    run_id: str,
    prompt: str,
    target_collection_id: Optional[str] = None,
) -> None:
    """
    Execute the Literature Reviewer workflow end-to-end as a background task.

    All state mutations happen through the service layer.
    All errors are caught and recorded; the run is never left in 'running' state.
    """
    log = RunLogger(run_id)
    log.info("Literature Reviewer started")
    log.info(f"Prompt: {prompt[:300]}")
    log.set_progress(5, "Initializing (Step 0/4)")

    trace: list[dict] = []

    try:
        # ── Step 1: Generate search queries ──────────────────────────────────
        log.set_progress(10, "Generating search queries (Step 1/4)")
        log.agent("Generating optimized arXiv search queries…")

        query_result = await _make_query_gen_agent().run(
            f"Research topic: {prompt}\n\n"
            "Generate 2–4 targeted arXiv search queries to find the most relevant papers."
        )
        queries = query_result.output.queries[:4]
        log.info(
            f"Query generation complete. Queries: {'; '.join(repr(q) for q in queries)}"
        )
        log.info(f"Strategy: {query_result.output.reasoning}")

        trace.append(
            {
                "step": "Query Generation",
                "status": "done",
                "detail": f"Agent formulated {len(queries)} search queries",
            }
        )

        # ── Step 2: Search arXiv ──────────────────────────────────────────────
        log.set_progress(20, "Searching arXiv (Step 2/4)")

        all_papers: dict[str, dict] = {}  # keyed by arxiv_id to deduplicate
        for q in queries:
            log.tool(f'Call arXiv API (query="{q}", limit=40)')
            fetched = await search_arxiv(q, max_results=40)
            new_count = 0
            for p in fetched:
                if p["arxiv_id"] not in all_papers:
                    all_papers[p["arxiv_id"]] = p
                    new_count += 1
            log.info(
                f'arXiv "{q}": {len(fetched)} retrieved, {new_count} new '
                f"(total unique: {len(all_papers)})"
            )

        papers_list = list(all_papers.values())
        log.info(f"Total unique candidates after deduplication: {len(papers_list)}")

        trace.append(
            {
                "step": "arXiv Search",
                "status": "done",
                "detail": f"Retrieved {len(papers_list)} unique candidate papers",
            }
        )

        if not papers_list:
            log.error("No papers found — nothing to screen")
            trace.append(
                {"step": "LLM Screening", "status": "done", "detail": "No candidates to screen"}
            )
            run_service.complete_run(run_id, trace)
            return

        # ── Step 3: Screen papers for relevance ───────────────────────────────
        log.set_progress(45, "Screening papers (Step 3/4)")
        log.agent(f"Screening {len(papers_list)} candidates in batches of {_BATCH_SIZE}…")

        all_scores: dict[str, PaperScore] = {}
        n_batches = (len(papers_list) + _BATCH_SIZE - 1) // _BATCH_SIZE

        for batch_idx in range(n_batches):
            batch = papers_list[batch_idx * _BATCH_SIZE : (batch_idx + 1) * _BATCH_SIZE]
            papers_text = ""
            for i, p in enumerate(batch, 1):
                papers_text += (
                    f"[{i}] arxiv_id={p['arxiv_id']}\n"
                    f"Title: {p['title']}\n"
                    f"Abstract: {p['abstract'][:500]}\n\n"
                )

            log.agent(
                f"Screening batch {batch_idx + 1}/{n_batches} "
                f"({len(batch)} papers)…"
            )
            screening_result = await _make_screening_agent().run(
                f"Research topic: {prompt}\n\nPapers to screen:\n{papers_text}"
            )
            for score in screening_result.output.scores:
                all_scores[score.arxiv_id] = score

        relevant = sorted(
            [s for s in all_scores.values() if s.relevance >= _RELEVANCE_THRESHOLD],
            key=lambda s: s.relevance,
            reverse=True,
        )
        log.info(
            f"Screening complete: {len(relevant)} relevant (score ≥ {_RELEVANCE_THRESHOLD}) "
            f"out of {len(papers_list)} screened"
        )

        trace.append(
            {
                "step": "LLM Screening",
                "status": "done",
                "detail": (
                    f"Filtered to {len(relevant)} highly relevant papers "
                    f"(score ≥ {_RELEVANCE_THRESHOLD})"
                ),
            }
        )

        # ── Step 4: Create paper + proposal records ───────────────────────────
        log.set_progress(80, "Creating proposals (Step 4/4)")
        log.agent(f"Creating paper and proposal records for {len(relevant)} papers…")

        run = run_service.get_run(run_id)
        run_name = run.workflow_name if run else "Literature Reviewer"
        proposal_count = 0

        for score in relevant:
            paper_data = all_papers.get(score.arxiv_id)
            if not paper_data:
                continue

            # Avoid duplicating papers already in the library
            existing = [
                p for p in paper_service.list_papers() if p.arxiv_id == score.arxiv_id
            ]
            if existing:
                paper_obj = existing[0]
                log.info(f"Already in library: {paper_obj.title[:70]}")
            else:
                paper_create = PaperCreate(
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
                paper_obj = paper_service.create_paper(paper_create)
                log.info(
                    f"Created paper: {paper_obj.title[:70]} "
                    f"(relevance={score.relevance}/10)"
                )

            proposal_service.create_proposal(paper_obj.id, run_id)
            proposal_count += 1

        log.info(f"Created {proposal_count} proposals — awaiting user review")

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
            detail=f"Proposed {proposal_count} additions — awaiting review",
            action_label="Review & Approve",
            action_href="/proposals",
        )

    except Exception as exc:
        logger.exception("Literature Reviewer workflow %s failed", run_id)
        log.error(f"Workflow failed: {exc}")
        run_service.fail_run(run_id, str(exc))
