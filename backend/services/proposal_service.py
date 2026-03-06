import logging
import uuid
from typing import Optional

from models.proposal import Proposal, ProposalResponse
from models.paper import Paper
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "proposals"
_PAPERS_TABLE = "papers"


def _to_response(proposal: Proposal, papers: list[Paper]) -> Optional[ProposalResponse]:
    paper = next((p for p in papers if p.id == proposal.paper_id), None)
    if paper is None:
        logger.warning("Paper %s not found for proposal %s", proposal.paper_id, proposal.id)
        return None
    return ProposalResponse(
        id=proposal.id,
        paper_id=proposal.paper_id,
        run_id=proposal.run_id,
        status=proposal.status,
        checked=proposal.checked,
        paper=paper,
    )


def _load_papers() -> list[Paper]:
    result = get_client().table(_PAPERS_TABLE).select("*").execute()
    return [Paper.model_validate(p) for p in result.data]


def create_proposal(paper_id: str, run_id: str) -> Proposal:
    proposal = Proposal(
        id=f"pp_{uuid.uuid4().hex[:8]}",
        paper_id=paper_id,
        run_id=run_id,
        status="pending",
        checked=True,
    )
    get_client().table(_TABLE).insert(proposal.model_dump(by_alias=False)).execute()
    logger.info("Created proposal %s for paper %s (run %s)", proposal.id, paper_id, run_id)
    return proposal


def list_proposals(run_id: Optional[str] = None) -> list[ProposalResponse]:
    query = get_client().table(_TABLE).select("*")
    if run_id:
        query = query.eq("run_id", run_id)
    result = query.execute()
    proposals = [Proposal.model_validate(p) for p in result.data]
    papers = _load_papers()
    return [r for p in proposals if (r := _to_response(p, papers)) is not None]


def get_proposal(proposal_id: str) -> Optional[ProposalResponse]:
    result = get_client().table(_TABLE).select("*").eq("id", proposal_id).execute()
    if not result.data:
        return None
    proposal = Proposal.model_validate(result.data[0])
    papers = _load_papers()
    return _to_response(proposal, papers)


def approve_proposal(proposal_id: str) -> Optional[ProposalResponse]:
    result = get_client().table(_TABLE).select("*").eq("id", proposal_id).execute()
    if not result.data:
        return None
    proposal = Proposal.model_validate(result.data[0])

    if proposal.status != "pending":
        papers = _load_papers()
        return _to_response(proposal, papers)

    # Update proposal status
    get_client().table(_TABLE).update({"status": "approved", "checked": True}).eq("id", proposal_id).execute()

    # Update paper
    paper_result = get_client().table(_PAPERS_TABLE).select("*").eq("id", proposal.paper_id).execute()
    if paper_result.data:
        paper = Paper.model_validate(paper_result.data[0])
        paper_updates: dict = {"status": "to-read", "rejected": False}

        from services.run_service import get_run
        run = get_run(proposal.run_id)
        if run and run.target_collection_id:
            existing = list(paper.collections)
            if run.target_collection_id not in existing:
                existing.append(run.target_collection_id)
            paper_updates["collections"] = existing

        get_client().table(_PAPERS_TABLE).update(paper_updates).eq("id", proposal.paper_id).execute()

    logger.info("Approved proposal %s (paper %s)", proposal_id, proposal.paper_id)

    # Return fresh data
    updated_proposal_result = get_client().table(_TABLE).select("*").eq("id", proposal_id).execute()
    updated_proposal = Proposal.model_validate(updated_proposal_result.data[0])
    papers = _load_papers()
    return _to_response(updated_proposal, papers)


def reject_proposal(proposal_id: str) -> Optional[ProposalResponse]:
    result = get_client().table(_TABLE).select("*").eq("id", proposal_id).execute()
    if not result.data:
        return None

    get_client().table(_TABLE).update({"status": "rejected", "checked": False}).eq("id", proposal_id).execute()
    logger.info("Rejected proposal %s", proposal_id)

    updated = get_client().table(_TABLE).select("*").eq("id", proposal_id).execute()
    proposal = Proposal.model_validate(updated.data[0])
    papers = _load_papers()
    return _to_response(proposal, papers)


def batch_action(ids: list[str], action: str) -> list[ProposalResponse]:
    results = []
    for proposal_id in ids:
        if action == "approve":
            result = approve_proposal(proposal_id)
        elif action == "reject":
            result = reject_proposal(proposal_id)
        else:
            continue
        if result:
            results.append(result)
    return results
