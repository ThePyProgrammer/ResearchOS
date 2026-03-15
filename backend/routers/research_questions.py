import logging
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.project_paper import RqPaperCreate
from models.research_question import ResearchQuestionCreate, ResearchQuestionUpdate
from services import project_service, rq_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["research-questions"])

NOT_FOUND_RQ = {"error": "not_found", "detail": "Research question not found"}
NOT_FOUND_PROJECT = {"error": "not_found", "detail": "Project not found"}
NOT_FOUND_LINK = {"error": "not_found", "detail": "Link not found"}


class ReorderRequest(BaseModel):
    ids: List[str]


# ---------------------------------------------------------------------------
# Project-scoped RQ endpoints
# ---------------------------------------------------------------------------

@router.post("/api/projects/{project_id}/research-questions", status_code=201)
async def create_rq(project_id: str, data: ResearchQuestionCreate):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    # Ensure project_id from path is authoritative
    canonical = ResearchQuestionCreate(
        project_id=project_id,
        parent_id=data.parent_id,
        question=data.question,
        position=data.position,
    )
    rq = rq_service.create_rq(canonical)
    return JSONResponse(rq.model_dump(by_alias=True), status_code=201)


@router.get("/api/projects/{project_id}/research-questions")
async def list_rqs(project_id: str):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    rqs = rq_service.list_rqs(project_id)
    return JSONResponse([rq.model_dump(by_alias=True) for rq in rqs])


# ---------------------------------------------------------------------------
# RQ-scoped endpoints
# ---------------------------------------------------------------------------

@router.patch("/api/research-questions/{rq_id}")
async def update_rq(rq_id: str, data: ResearchQuestionUpdate):
    rq = rq_service.update_rq(rq_id, data)
    if rq is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_RQ)
    return JSONResponse(rq.model_dump(by_alias=True))


@router.delete("/api/research-questions/{rq_id}", status_code=204)
async def delete_rq(rq_id: str):
    deleted = rq_service.delete_rq(rq_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND_RQ)


@router.post("/api/research-questions/{rq_id}/reorder", status_code=204)
async def reorder_rqs(rq_id: str, body: ReorderRequest):
    """Reorder sibling RQs. rq_id is the reference; ordering comes from body.ids."""
    rq_service.reorder_rqs(body.ids)


# ---------------------------------------------------------------------------
# RQ-paper link endpoints
# ---------------------------------------------------------------------------

@router.get("/api/research-questions/{rq_id}/papers")
async def list_rq_papers(rq_id: str):
    if rq_service.get_rq(rq_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_RQ)
    links = rq_service.list_rq_papers(rq_id)
    return JSONResponse([lnk.model_dump(by_alias=True) for lnk in links])


@router.post("/api/research-questions/{rq_id}/papers", status_code=201)
async def link_paper_to_rq(rq_id: str, data: RqPaperCreate):
    if rq_service.get_rq(rq_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_RQ)
    link = rq_service.link_paper_to_rq(rq_id, data)
    return JSONResponse(link.model_dump(by_alias=True), status_code=201)


@router.delete("/api/research-questions/{rq_id}/papers/{link_id}", status_code=204)
async def unlink_paper_from_rq(rq_id: str, link_id: str):
    deleted = rq_service.unlink_paper_from_rq(link_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND_LINK)
