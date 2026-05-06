"""Batch processing router — bulk tagging, embeddings, and notes preview."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from services.batch_service import batch_index_embeddings, batch_notes_preview
from services.keyword_extraction_service import extract_keywords_for_items

logger = logging.getLogger(__name__)

_MAX_BATCH_ITEMS = 100

router = APIRouter(prefix="/api/batch", tags=["batch"])


class BatchItemRequest(BaseModel):
    item_ids: list[str] = Field(min_length=1, max_length=_MAX_BATCH_ITEMS)
    library_id: Optional[str] = None

    @field_validator("item_ids")
    @classmethod
    def validate_item_ids(cls, ids: list[str]) -> list[str]:
        cleaned = [item_id.strip() for item_id in ids]
        if any(not item_id for item_id in cleaned):
            raise ValueError("item_ids cannot contain empty values")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("item_ids cannot contain duplicates")
        return cleaned


@router.post("/tags")
def post_tags(data: BatchItemRequest):
    """Bulk auto-tag items via AI keyword extraction."""
    try:
        result = extract_keywords_for_items(data.item_ids, library_id=data.library_id)
        return JSONResponse(content=result)
    except Exception as exc:
        logger.exception("Bulk tag extraction failed", exc_info=exc)
        raise HTTPException(status_code=500, detail="Batch operation failed")


@router.post("/embeddings")
async def post_embeddings(data: BatchItemRequest):
    """Bulk generate embeddings for items."""
    try:
        result = await batch_index_embeddings(data.item_ids)
        return JSONResponse(content=result)
    except Exception as exc:
        logger.exception("Bulk embedding indexing failed", exc_info=exc)
        raise HTTPException(status_code=500, detail="Batch operation failed")


@router.post("/notes/preview")
def post_notes_preview(data: BatchItemRequest):
    """Preview which items will be skipped for bulk note generation."""
    try:
        result = batch_notes_preview(data.item_ids)
        return JSONResponse(content=result)
    except Exception as exc:
        logger.exception("Bulk notes preview failed", exc_info=exc)
        raise HTTPException(status_code=500, detail="Batch operation failed")
