import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search_papers(
    q: str = "",
    mode: str = "lexical",
    limit: int = 10,
):
    """
    Search the paper library.

    - mode=lexical  (default) — fast weighted keyword match; no API key needed
    - mode=semantic           — OpenAI embedding cosine similarity; falls back to
                                lexical when OPENAI_API_KEY is absent
    """
    from services.search_service import search

    if not q.strip():
        return JSONResponse([])

    if mode not in ("lexical", "semantic"):
        mode = "lexical"

    limit = max(1, min(limit, 50))

    results = await search(q.strip(), mode=mode, limit=limit)
    return JSONResponse([
        {**paper.model_dump(by_alias=True), "score": round(score, 4)}
        for paper, score in results
    ])
