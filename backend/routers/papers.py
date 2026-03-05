import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.paper import PaperCreate, PaperUpdate
from services import paper_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/papers", tags=["papers"])

NOT_FOUND = {"error": "not_found", "detail": "Paper not found"}


@router.get("")
async def list_papers(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    papers = paper_service.list_papers(
        collection_id=collection_id,
        status=status,
        search=search,
    )
    return JSONResponse([p.model_dump(by_alias=True) for p in papers])


@router.post("", status_code=201)
async def create_paper(data: PaperCreate):
    paper = paper_service.create_paper(data)
    return JSONResponse(paper.model_dump(by_alias=True), status_code=201)


@router.get("/{paper_id}")
async def get_paper(paper_id: str):
    paper = paper_service.get_paper(paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(paper.model_dump(by_alias=True))


@router.patch("/{paper_id}")
async def update_paper(paper_id: str, data: PaperUpdate):
    paper = paper_service.update_paper(paper_id, data)
    if paper is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(paper.model_dump(by_alias=True))


@router.delete("/{paper_id}", status_code=204)
async def delete_paper(paper_id: str):
    deleted = paper_service.delete_paper(paper_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
