import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.proposal import BatchAction
from services import proposal_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/proposals", tags=["proposals"])

NOT_FOUND = {"error": "not_found", "detail": "Proposal not found"}


@router.get("")
async def list_proposals(run_id: Optional[str] = None):
    proposals = proposal_service.list_proposals(run_id=run_id)
    return JSONResponse([p.model_dump(by_alias=True) for p in proposals])


@router.post("/batch")
async def batch_action(data: BatchAction):
    if data.action not in ("approve", "reject"):
        raise HTTPException(status_code=422, detail="action must be 'approve' or 'reject'")
    results = proposal_service.batch_action(data.ids, data.action)
    return JSONResponse([p.model_dump(by_alias=True) for p in results])


@router.post("/{proposal_id}/approve")
async def approve_proposal(proposal_id: str):
    result = proposal_service.approve_proposal(proposal_id)
    if result is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(result.model_dump(by_alias=True))


@router.post("/{proposal_id}/reject")
async def reject_proposal(proposal_id: str):
    result = proposal_service.reject_proposal(proposal_id)
    if result is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(result.model_dump(by_alias=True))
