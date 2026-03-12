import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search_library(
    q: str = "",
    mode: str = "lexical",
    limit: int = 10,
    library_id: Optional[str] = None,
    types: Optional[str] = None,
):
    """
    Search across papers, websites, and GitHub repos.

    - mode=lexical  (default) — fast weighted keyword match; no API key needed
    - mode=semantic           — OpenAI embedding cosine similarity; falls back to
                                lexical when OPENAI_API_KEY is absent
    - library_id              — optional; restrict results to a specific library
    - types                   — optional comma-separated item types to include:
                                "paper,website,github_repo" (default: all three)

    Each result includes all item fields plus a `score` field.
    The `itemType` field ("paper" | "website" | "github_repo") identifies the type.
    """
    from services.search_service import search

    if not q.strip():
        return JSONResponse([])

    if mode not in ("lexical", "semantic"):
        mode = "lexical"

    limit = max(1, min(limit, 50))

    parsed_types: Optional[list[str]] = None
    if types:
        allowed = {"paper", "website", "github_repo"}
        parsed_types = [t.strip() for t in types.split(",") if t.strip() in allowed]
        if not parsed_types:
            parsed_types = None  # invalid → default to all

    results = await search(
        q.strip(),
        mode=mode,
        limit=limit,
        library_id=library_id or None,
        types=parsed_types,
    )

    return JSONResponse([
        {**item.model_dump(by_alias=True), "score": round(score, 4)}
        for item, score in results
    ])


@router.get("/map")
async def library_map(library_id: Optional[str] = None):
    """
    Return UMAP 2D coordinates for every item in a library that has a cached
    embedding.  Used by the Library Map visualisation.

    Each result contains: ``id``, ``x``, ``y``, ``title``, ``itemType``,
    ``collections``, ``url``.  Coordinates are normalised to [-1, 1].

    The projection is cached in ``data/map_cache.json`` and only recomputed
    when the set of embedded items changes.

    Returns 503 when ``umap-learn`` is not installed.
    """
    from services.map_service import build_map

    try:
        points = await build_map(library_id=library_id or None)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        )

    return JSONResponse(points)
