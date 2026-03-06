import logging
from typing import Optional

from services.db import get_client

logger = logging.getLogger(__name__)

_BUCKET = "pdfs"


def upload_pdf(paper_id: str, file_bytes: bytes) -> str:
    """Upload a PDF to Supabase Storage and return its public URL."""
    path = f"{paper_id}.pdf"
    client = get_client()

    # Remove any existing file so we can re-upload cleanly
    try:
        client.storage.from_(_BUCKET).remove([path])
    except Exception:
        pass  # file may not exist yet

    client.storage.from_(_BUCKET).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )

    url: str = client.storage.from_(_BUCKET).get_public_url(path)
    logger.info("Uploaded PDF for paper %s → %s", paper_id, url)
    return url


def delete_pdf(paper_id: str) -> None:
    """Remove a paper's PDF from Supabase Storage."""
    path = f"{paper_id}.pdf"
    try:
        get_client().storage.from_(_BUCKET).remove([path])
        logger.info("Deleted PDF for paper %s", paper_id)
    except Exception as exc:
        logger.warning("Could not delete PDF for paper %s: %s", paper_id, exc)
