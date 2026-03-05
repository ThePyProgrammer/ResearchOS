import logging
from typing import Optional

from models.proposal import Proposal, ProposalResponse
from models.paper import Paper
from services.storage import load_json, save_json

logger = logging.getLogger(__name__)

_FILE = "proposals.json"
_PAPERS_FILE = "papers.json"


def _load_proposals() -> list[Proposal]:
    raw = load_json(_FILE)
    return [Proposal.model_validate(p) for p in raw]


def _save_proposals(proposals: list[Proposal]) -> None:
    save_json(_FILE, [p.model_dump(by_alias=False) for p in proposals])


def _load_papers() -> list[Paper]:
    raw = load_json(_PAPERS_FILE)
    return [Paper.model_validate(p) for p in raw]


def _save_papers(papers: list[Paper]) -> None:
    save_json(_PAPERS_FILE, [p.model_dump(by_alias=False) for p in papers])


def _get_paper(paper_id: str, papers: list[Paper]) -> Optional[Paper]:
    return next((p for p in papers if p.id == paper_id), None)


def _to_response(proposal: Proposal, papers: list[Paper]) -> Optional[ProposalResponse]:
    paper = _get_paper(proposal.paper_id, papers)
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


def list_proposals(run_id: Optional[str] = None) -> list[ProposalResponse]:
    proposals = _load_proposals()
    papers = _load_papers()
    if run_id:
        proposals = [p for p in proposals if p.run_id == run_id]
    responses = []
    for proposal in proposals:
        resp = _to_response(proposal, papers)
        if resp is not None:
            responses.append(resp)
    return responses


def get_proposal(proposal_id: str) -> Optional[ProposalResponse]:
    proposals = _load_proposals()
    papers = _load_papers()
    proposal = next((p for p in proposals if p.id == proposal_id), None)
    if proposal is None:
        return None
    return _to_response(proposal, papers)


def approve_proposal(proposal_id: str) -> Optional[ProposalResponse]:
    proposals = _load_proposals()
    papers = _load_papers()

    p_idx = next((i for i, p in enumerate(proposals) if p.id == proposal_id), None)
    if p_idx is None:
        return None

    proposal = proposals[p_idx]
    if proposal.status != "pending":
        return _to_response(proposal, papers)

    # Update proposal status
    proposals[p_idx] = proposal.model_copy(update={"status": "approved", "checked": True})

    # Update paper status
    paper_idx = next((i for i, p in enumerate(papers) if p.id == proposal.paper_id), None)
    if paper_idx is not None:
        paper = papers[paper_idx]
        updates: dict = {"status": "to-read", "rejected": False}
        # Add to target collection if run has one
        from services.run_service import get_run
        run = get_run(proposal.run_id)
        if run and run.target_collection_id:
            existing = list(paper.collections)
            if run.target_collection_id not in existing:
                existing.append(run.target_collection_id)
            updates["collections"] = existing
        papers[paper_idx] = paper.model_copy(update=updates)

    _save_proposals(proposals)
    _save_papers(papers)
    logger.info("Approved proposal %s (paper %s)", proposal_id, proposal.paper_id)
    return _to_response(proposals[p_idx], papers)


def reject_proposal(proposal_id: str) -> Optional[ProposalResponse]:
    proposals = _load_proposals()
    papers = _load_papers()

    p_idx = next((i for i, p in enumerate(proposals) if p.id == proposal_id), None)
    if p_idx is None:
        return None

    proposal = proposals[p_idx]
    proposals[p_idx] = proposal.model_copy(update={"status": "rejected", "checked": False})
    _save_proposals(proposals)
    logger.info("Rejected proposal %s", proposal_id)
    return _to_response(proposals[p_idx], papers)


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
