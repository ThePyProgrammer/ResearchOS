import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.paper import PaperCreate, PaperUpdate
from services import paper_service
from services import activity_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/papers", tags=["papers"])

NOT_FOUND = {"error": "not_found", "detail": "Paper not found"}


def _auto_download_pdf(paper_id: str, pdf_url: str) -> None:
    """Background task: download PDF from external URL and upload to Supabase Storage."""
    import httpx
    from services.pdf_service import upload_pdf

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ResearchOS/0.1; mailto:researchos@localhost)",
        "Accept": "application/pdf,*/*",
    }
    try:
        with httpx.Client(headers=headers, timeout=60.0, follow_redirects=True) as client:
            resp = client.get(pdf_url)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            is_pdf = "pdf" in content_type or resp.content[:5] == b"%PDF-"
            if not is_pdf:
                logger.warning("Auto-download: response for paper %s is not a PDF (content-type: %s, first bytes: %r)", paper_id, content_type, resp.content[:10])
                return
            stored_url = upload_pdf(paper_id, resp.content)
            paper_service.update_paper(paper_id, PaperUpdate(pdf_url=stored_url))
            logger.info("Auto-downloaded PDF for paper %s → %s", paper_id, stored_url)
    except Exception:
        logger.exception("Auto-download: failed to download PDF for paper %s from %s", paper_id, pdf_url)


def _auto_download_and_process(paper_id: str, library_id: Optional[str], pdf_url: Optional[str]) -> None:
    """Background task: download PDF to Supabase, then generate notes if enabled."""
    if pdf_url:
        _auto_download_pdf(paper_id, pdf_url)
    _auto_generate_notes(paper_id, library_id, pdf_url)


def _auto_generate_notes(paper_id: str, library_id: Optional[str], pdf_url: Optional[str]) -> None:
    """Background task: extract PDF text then generate AI notes if auto-note is enabled."""
    from services import library_service, note_service
    from services.pdf_text_service import extract_and_cache

    if not library_id:
        return
    library = library_service.get_library(library_id)
    if not library or not library.auto_note_enabled:
        return

    if pdf_url:
        try:
            extract_and_cache(paper_id, pdf_url)
        except Exception:
            logger.warning("Auto-note: PDF text extraction failed for paper %s, generating from metadata only", paper_id)

    try:
        notes = note_service.generate_notes(paper_id, library_id=library_id)
        logger.info("Auto-note: generated %d notes for paper %s", len(notes), paper_id)
    except Exception:
        logger.exception("Auto-note: generation failed for paper %s", paper_id)


@router.get("")
async def list_papers(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    library_id: Optional[str] = None,
):
    papers = paper_service.list_papers(
        collection_id=collection_id,
        status=status,
        search=search,
        library_id=library_id,
    )
    return JSONResponse([p.model_dump(by_alias=True) for p in papers])


@router.post("", status_code=201)
async def create_paper(data: PaperCreate):
    paper = paper_service.create_paper(data)
    activity_service.log_activity(
        type="human",
        icon="note_add",
        icon_color="text-blue-600",
        icon_bg="bg-blue-50",
        title=f"Added \"{paper.title}\"",
        detail=", ".join(paper.authors[:2]) + (" et al." if len(paper.authors) > 2 else "") if paper.authors else None,
        action_label="View paper",
        action_href=f"/library/paper/{paper.id}",
        library_id=paper.library_id,
    )
    return JSONResponse(paper.model_dump(by_alias=True), status_code=201)


# ---------------------------------------------------------------------------
# Quick-add: resolve DOI / arXiv ID / URL → create paper
# ---------------------------------------------------------------------------

class ImportRequest(BaseModel):
    identifier: str  # DOI, arXiv ID, or URL
    library_id: Optional[str] = None


@router.post("/import", status_code=201)
async def import_paper(data: ImportRequest, background_tasks: BackgroundTasks):
    """
    Resolve a DOI, arXiv ID, or URL to paper metadata and add it to the library.

    - DOI   → Crossref Works API
    - arXiv → arXiv Atom API
    - URL   → arXiv/doi.org sniff, then HTML citation_* meta-tag extraction
    """
    from services.import_service import resolve_identifier

    identifier = data.identifier.strip()
    if not identifier:
        raise HTTPException(status_code=422, detail="identifier must not be empty")

    try:
        meta = await resolve_identifier(identifier)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error resolving identifier '%s'", identifier)
        raise HTTPException(
            status_code=502,
            detail=f"Metadata lookup failed: {exc}",
        ) from exc

    if not meta.get("title"):
        raise HTTPException(
            status_code=422,
            detail="Could not extract a title from that identifier.",
        )

    # Deduplicate: skip if a paper with the same arxiv_id or DOI already exists
    existing_papers = paper_service.list_papers()
    arxiv_id = meta.get("arxiv_id")
    doi = meta.get("doi")
    for existing in existing_papers:
        if arxiv_id and existing.arxiv_id == arxiv_id:
            return JSONResponse(
                {**existing.model_dump(by_alias=True), "already_exists": True},
                status_code=200,
            )
        if doi and existing.doi == doi:
            return JSONResponse(
                {**existing.model_dump(by_alias=True), "already_exists": True},
                status_code=200,
            )

    paper_create = PaperCreate(
        title=meta["title"],
        authors=meta.get("authors") or [],
        year=meta.get("year") or 0,
        published_date=meta.get("published_date"),
        venue=meta.get("venue") or "Unknown",
        doi=doi,
        arxiv_id=arxiv_id,
        status="inbox",
        abstract=meta.get("abstract"),
        source="human",
        pdf_url=meta.get("pdf_url"),
        library_id=data.library_id,
    )
    paper = paper_service.create_paper(paper_create)
    logger.info("Imported paper '%s' from identifier '%s'", paper.title, identifier)
    activity_service.log_activity(
        type="human",
        icon="note_add",
        icon_color="text-blue-600",
        icon_bg="bg-blue-50",
        title=f"Imported \"{paper.title}\"",
        detail=", ".join(paper.authors[:2]) + (" et al." if len(paper.authors) > 2 else "") if paper.authors else None,
        action_label="View paper",
        action_href=f"/library/paper/{paper.id}",
        library_id=paper.library_id,
    )

    # Auto-download PDF and generate AI notes in the background
    if paper.pdf_url:
        logger.info("Queuing auto-download for paper %s from %s", paper.id, paper.pdf_url)
        background_tasks.add_task(_auto_download_and_process, paper.id, paper.library_id, paper.pdf_url)
    else:
        logger.info("No pdf_url for paper %s, skipping auto-download", paper.id)

    return JSONResponse(
        {**paper.model_dump(by_alias=True), "already_exists": False},
        status_code=201,
    )


# ---------------------------------------------------------------------------
# PDF metadata extraction (GROBID-like, via pymupdf4llm + OpenAI)
# ---------------------------------------------------------------------------

@router.post("/extract-metadata")
async def extract_metadata(file: UploadFile = File(...)):
    """Extract metadata (title, authors, date, venue, abstract, DOI) from a PDF using LLM."""
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted")

    from services.pdf_metadata_service import extract_metadata_from_bytes

    file_bytes = await file.read()
    try:
        meta = extract_metadata_from_bytes(file_bytes)
    except Exception as exc:
        logger.exception("Failed to extract metadata from uploaded PDF")
        raise HTTPException(status_code=502, detail=f"Metadata extraction failed: {exc}") from exc

    return JSONResponse(meta)


@router.get("/{paper_id}")
async def get_paper(paper_id: str):
    paper = paper_service.get_paper(paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(paper.model_dump(by_alias=True))


@router.patch("/{paper_id}")
async def update_paper(paper_id: str, data: PaperUpdate):
    paper = paper_service.update_paper(paper_id, data)
    if paper is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(paper.model_dump(by_alias=True))


@router.delete("/{paper_id}", status_code=204)
async def delete_paper(paper_id: str):
    deleted = paper_service.delete_paper(paper_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)


@router.post("/{paper_id}/pdf", status_code=200)
async def upload_pdf(paper_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a PDF file for a paper and store it in Supabase Storage."""
    paper = paper_service.get_paper(paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted")

    from services.pdf_service import upload_pdf as _upload
    file_bytes = await file.read()
    pdf_url = _upload(paper_id, file_bytes)
    paper_service.set_pdf_url(paper_id, pdf_url)

    updated = paper_service.get_paper(paper_id)

    # Auto-generate AI notes in the background if the library has it enabled
    background_tasks.add_task(_auto_generate_notes, updated.id, updated.library_id, pdf_url)

    return JSONResponse(updated.model_dump(by_alias=True))


@router.delete("/{paper_id}/pdf", status_code=204)
async def delete_pdf(paper_id: str):
    """Remove a paper's PDF from Supabase Storage and clear its url."""
    paper = paper_service.get_paper(paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    from services.pdf_service import delete_pdf as _delete
    from services.pdf_text_service import delete_cached_text
    _delete(paper_id)
    paper_service.set_pdf_url(paper_id, None)
    delete_cached_text(paper_id)
