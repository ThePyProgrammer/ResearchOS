"""Managed paper PDFs. Supabase remains the database provider."""
import logging
import os
import re
from functools import lru_cache
from urllib.parse import quote, unquote, urlsplit

from services.db import get_client

logger = logging.getLogger(__name__)

_BUCKET = "pdfs"


def managed_location(url: str | None) -> tuple[str, str] | None:
    """Resolve only configured storage locations; never classify arbitrary hosts."""
    if not url:
        return None
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.query or parsed.fragment:
        return None
    source = urlsplit(os.environ.get("SUPABASE_URL", ""))
    prefix = f"/storage/v1/object/public/{_BUCKET}/"
    if source.netloc and parsed.netloc == source.netloc and parsed.path.startswith(prefix):
        key = unquote(parsed.path[len(prefix):])
        return ("supabase", key) if key else None
    bucket = os.environ.get("GCS_PDF_BUCKET", "")
    if bucket:
        prefix = f"/{bucket}/"
        if parsed.netloc == "storage.googleapis.com" and parsed.path.startswith(prefix):
            key = unquote(parsed.path[len(prefix):])
            return ("gcs", key) if key else None
        if parsed.netloc == f"{bucket}.storage.googleapis.com":
            key = unquote(parsed.path.lstrip("/"))
            return ("gcs", key) if key else None
    return None


@lru_cache(maxsize=1)
def get_gcs_client():
    from google.cloud import storage
    return storage.Client(project=os.environ.get("GCS_PROJECT_ID") or None)


def _gcs_bucket():
    name = os.environ.get("GCS_PDF_BUCKET")
    if not name:
        raise RuntimeError("GCS_PDF_BUCKET must be set when using GCS PDF storage")
    return get_gcs_client().bucket(name)


def upload_pdf(paper_id: str, file_bytes: bytes) -> str:
    """Upload to the configured provider and return a permanent HTTPS URL."""
    if not re.fullmatch(r"p_[A-Za-z0-9_-]+", paper_id):
        raise ValueError("Invalid paper ID")
    if not file_bytes.startswith(b"%PDF-"):
        raise ValueError("File does not have a PDF header")
    path = f"{paper_id}.pdf"
    provider = os.environ.get("PAPER_STORAGE_PROVIDER", "supabase")
    if provider == "gcs":
        bucket = _gcs_bucket()
        existing = bucket.get_blob(path)
        blob = bucket.blob(path)
        blob.cache_control = "no-cache"
        blob.content_disposition = "inline"
        blob.upload_from_string(
            file_bytes, content_type="application/pdf", checksum="auto",
            if_generation_match=int(existing.generation) if existing else 0,
            timeout=120,
        )
        url = f"https://storage.googleapis.com/{bucket.name}/{quote(path, safe='/')}"
    elif provider == "supabase":
        client = get_client()
        client.storage.from_(_BUCKET).upload(
            path=path, file=file_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
        url = client.storage.from_(_BUCKET).get_public_url(path)
    else:
        raise RuntimeError(f"Unsupported PAPER_STORAGE_PROVIDER: {provider}")
    logger.info("Uploaded PDF for paper %s → %s", paper_id, url)
    return url


def delete_pdf(paper_id: str, pdf_url: str | None) -> None:
    """Delete using the existing record's location, never the new-write provider."""
    location = managed_location(pdf_url)
    if location is None:
        return
    provider, path = location
    if provider == "gcs":
        from google.api_core.exceptions import NotFound
        bucket = _gcs_bucket()
        blob = bucket.get_blob(path)
        if blob is not None:
            try:
                blob.delete(if_generation_match=int(blob.generation), timeout=120)
            except NotFound:
                pass
    else:
        get_client().storage.from_(_BUCKET).remove([path])
    logger.info("Deleted PDF for paper %s from %s", paper_id, provider)
