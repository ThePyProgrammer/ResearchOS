import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.author import AuthorCreate, AuthorUpdate
from services import author_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/authors", tags=["authors"])

NOT_FOUND = {"error": "not_found", "detail": "Author not found"}


@router.get("")
async def list_authors(
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    authors = author_service.list_authors(search=search, limit=limit)
    return JSONResponse([a.model_dump(by_alias=True) for a in authors])


@router.get("/search")
async def search_authors(
    q: str = Query("", min_length=1),
    limit: int = Query(10, ge=1, le=50),
):
    results = author_service.search_authors(q, limit=limit)
    return JSONResponse([r.model_dump(by_alias=True) for r in results])


class MatchRequest(BaseModel):
    name: str
    context: Optional[dict] = None  # title, venue, co_authors for AI ranking


@router.post("/match")
async def match_authors(data: MatchRequest):
    if not data.name.strip():
        raise HTTPException(status_code=422, detail="name must not be empty")
    candidates = author_service.find_matching_authors(data.name)
    return JSONResponse([
        {
            "author": c["author"].model_dump(by_alias=True),
            "confidence": c["confidence"],
        }
        for c in candidates
    ])


@router.post("", status_code=201)
async def create_author(data: AuthorCreate):
    if not data.name.strip():
        raise HTTPException(status_code=422, detail="name must not be empty")
    author = author_service.create_author(data)
    return JSONResponse(author.model_dump(by_alias=True), status_code=201)


@router.get("/{author_id}")
async def get_author(author_id: str):
    author = author_service.get_author(author_id)
    if author is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(author.model_dump(by_alias=True))


@router.patch("/{author_id}")
async def update_author(author_id: str, data: AuthorUpdate):
    author = author_service.update_author(author_id, data)
    if author is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(author.model_dump(by_alias=True))


@router.delete("/{author_id}", status_code=204)
async def delete_author(author_id: str):
    deleted = author_service.delete_author(author_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)


@router.get("/{author_id}/papers")
async def get_author_papers(author_id: str):
    author = author_service.get_author(author_id)
    if author is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    papers = author_service.get_author_papers(author_id)
    return JSONResponse([p.model_dump(by_alias=True) for p in papers])


@router.post("/{author_id}/enrich")
async def enrich_author(author_id: str):
    """AI enrichment — collect linked papers and suggest profile updates."""
    author = author_service.get_author(author_id)
    if author is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    from services.author_match_service import enrich_author as _enrich

    try:
        suggestions = await _enrich(author)
    except Exception as exc:
        logger.exception("Failed to enrich author %s", author_id)
        raise HTTPException(status_code=502, detail=f"Enrichment failed: {exc}") from exc

    return JSONResponse(suggestions)
