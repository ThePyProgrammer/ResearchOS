"""Extract text/markdown from PDFs stored in Supabase using pymupdf4llm."""

import logging
import tempfile
from datetime import datetime, timezone
from typing import Optional

import httpx
import pymupdf4llm

from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "paper_texts"

# Truncate to ~120k chars to stay within reasonable context limits
MAX_TEXT_LENGTH = 120_000


def get_cached_text(paper_id: str) -> Optional[dict]:
    """Return cached extraction if available."""
    result = get_client().table(_TABLE).select("*").eq("paper_id", paper_id).execute()
    if not result.data:
        return None
    return result.data[0]


def extract_and_cache(paper_id: str, pdf_url: str) -> dict:
    """Download PDF from Supabase Storage, extract markdown via pymupdf4llm, cache result."""
    # Check cache first
    cached = get_cached_text(paper_id)
    if cached:
        logger.info("Using cached text for paper %s (%d pages)", paper_id, cached["page_count"])
        return cached

    logger.info("Extracting text from PDF for paper %s: %s", paper_id, pdf_url[:80])

    # Download PDF to a temp file
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(pdf_url)
        resp.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(resp.content)
        tmp_path = tmp.name

    try:
        # Extract markdown from PDF
        md_text = pymupdf4llm.to_markdown(tmp_path)

        # Count pages
        import pymupdf
        doc = pymupdf.open(tmp_path)
        page_count = len(doc)
        doc.close()

        # Truncate if too large
        if len(md_text) > MAX_TEXT_LENGTH:
            md_text = md_text[:MAX_TEXT_LENGTH] + "\n\n[... truncated for context limit ...]"

        now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        row = {
            "paper_id": paper_id,
            "markdown": md_text,
            "page_count": page_count,
            "extracted_at": now,
        }

        # Upsert into cache table
        get_client().table(_TABLE).upsert(row).execute()
        logger.info("Extracted and cached %d chars from %d pages for paper %s", len(md_text), page_count, paper_id)
        return row

    except Exception:
        logger.exception("Failed to extract text from PDF for paper %s", paper_id)
        raise
    finally:
        import os
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def delete_cached_text(paper_id: str) -> None:
    """Remove cached text when PDF is removed."""
    get_client().table(_TABLE).delete().eq("paper_id", paper_id).execute()
    logger.info("Deleted cached text for paper %s", paper_id)
