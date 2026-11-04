from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from postgrest.exceptions import APIError

from models.citation import CitationJob, CitationPage
from services import citation_repository as repository, paper_service
from services.pdf_reference_service import configured_url
from services.pdf_service import managed_location
from services.openalex_client import CitationProviderError

router = APIRouter(prefix="/api", tags=["citations"])


def _call(fn, *args):
    try:
        return fn(*args)
    except APIError as exc:
        if exc.code in {"42P01", "42883", "PGRST202", "PGRST205"}:
            raise HTTPException(503, "Citation indexing is not installed. Apply migration 033.") from None
        raise


@router.get("/papers/{paper_id}/citations", response_model=CitationPage)
def citations(paper_id: str, direction: Literal["outgoing", "incoming"] = "outgoing",
              limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    result = _call(repository.get_page, paper_id, direction, limit, offset)
    if result is None:
        raise HTTPException(404, {"error": "not_found", "detail": "Paper not found"})
    return CitationPage.model_validate(result)


@router.post("/papers/{paper_id}/citations/reindex", status_code=202, response_model=list[CitationJob])
def reindex(paper_id: str):
    jobs = _call(repository.enqueue, paper_id, True)
    if not jobs:
        raise HTTPException(404, {"error": "not_found", "detail": "Paper not found"})
    return [CitationJob.model_validate(job) for job in jobs]


@router.get("/citation-jobs/{job_id}", response_model=CitationJob)
def citation_job(job_id: UUID):
    job = _call(repository.get_job, str(job_id))
    if not job or paper_service.get_paper(job["paper_id"]) is None:
        raise HTTPException(404, {"error": "not_found", "detail": "Citation job not found"})
    return CitationJob.model_validate(job)


@router.post("/papers/{paper_id}/citations/pdf/reindex", status_code=202, response_model=list[CitationJob])
def reindex_pdf(paper_id: str):
    paper = paper_service.get_paper(paper_id)
    if paper is None:
        raise HTTPException(404, {"error": "not_found", "detail": "Paper not found"})
    try:
        url = configured_url()
    except CitationProviderError as exc:
        raise HTTPException(503, str(exc)) from None
    if not url:
        raise HTTPException(503, "PDF bibliography indexing requires a configured GROBID service.")
    if not managed_location(paper.pdf_url):
        raise HTTPException(422, "Upload or store this PDF before indexing its bibliography.")
    try:
        jobs = repository.enqueue_pdf(paper_id, True)
    except APIError as exc:
        if exc.code in {"42P01", "42883", "PGRST202", "PGRST205"}:
            raise HTTPException(503, "PDF bibliography indexing is not installed. Apply migration 034.") from None
        raise
    if not jobs:
        raise HTTPException(404, {"error": "not_found", "detail": "Paper not found"})
    return [CitationJob.model_validate(job) for job in jobs]
