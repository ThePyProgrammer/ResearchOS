"""One bounded job at a time. Database leases support multiple worker processes."""
import logging

import httpx

from services import citation_repository as repository, paper_service
from services.citation_service import fetch_crossref, fetch_openalex
from services.pdf_reference_service import fetch_pdf_references
from services.openalex_client import CitationProviderError

logger = logging.getLogger(__name__)


async def run_one(job_id: str | None = None) -> dict | None:
    job = repository.claim(job_id)
    if not job:
        return None
    try:
        paper = paper_service.get_paper(job["paper_id"])
        if paper is None:
            return {"id": job["id"], "status": "deleted"}
        async with httpx.AsyncClient(timeout=30, follow_redirects=True,
                                     headers={"User-Agent": "ResearchOS-Citations/1.0"}) as client:
            data = paper.model_dump()
            if job["provider"] == "openalex":
                result = await fetch_openalex(data, client)
            elif job["provider"] == "grobid":
                result = await fetch_pdf_references(data, client)
            else:
                result = await fetch_crossref(data, client, job.get("captured_record"))
        published = repository.finish(job, result)
        return {"id": job["id"], "status": result.status if published else "superseded"}
    except CitationProviderError as exc:
        repository.fail(job, str(exc), retry=exc.retryable,
                        retry_seconds=max(exc.retry_after, 2 ** min(job["attempts"], 10)))
        return {"id": job["id"], "status": "retry_pending" if exc.retryable and job["attempts"] < 5 else "failed",
                "retry_after": exc.retry_after if exc.retryable else 0}
    except Exception as exc:
        # Avoid exception strings/traces: HTTP and database errors can contain credentials or payloads.
        logger.error("Citation job %s failed (%s)", job["id"], type(exc).__name__)
        repository.fail(job, "Internal indexing error; check worker configuration", retry=True)
        return {"id": job["id"], "status": "retry_pending" if job["attempts"] < 5 else "failed"}
