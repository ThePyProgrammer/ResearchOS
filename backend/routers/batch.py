"""Batch processing router — bulk tagging, embeddings, and notes preview."""

from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.batch_service import batch_index_embeddings, batch_notes_preview
from services.keyword_extraction_service import extract_keywords_for_items

router = APIRouter(prefix="/api/batch", tags=["batch"])


class BatchItemRequest(BaseModel):
    item_ids: list[str]
    library_id: Optional[str] = None


@router.post("/tags")
def post_tags(data: BatchItemRequest):
    """Bulk auto-tag items via AI keyword extraction."""
    try:
        result = extract_keywords_for_items(data.item_ids, library_id=data.library_id)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "batch_failed", "detail": str(e)})


@router.post("/embeddings")
async def post_embeddings(data: BatchItemRequest):
    """Bulk generate embeddings for items."""
    try:
        result = await batch_index_embeddings(data.item_ids)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "batch_failed", "detail": str(e)})


@router.post("/notes/preview")
def post_notes_preview(data: BatchItemRequest):
    """Preview which items will be skipped for bulk note generation."""
    try:
        result = batch_notes_preview(data.item_ids)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "batch_failed", "detail": str(e)})
