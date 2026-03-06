import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.paper import PaperCreate, PaperUpdate
from services import paper_service
from services import activity_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/papers", tags=["papers"])

NOT_FOUND = {"error": "not_found", "detail": "Paper not found"}


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
    )
    return JSONResponse(paper.model_dump(by_alias=True), status_code=201)


# ---------------------------------------------------------------------------
# Quick-add: resolve DOI / arXiv ID / URL → create paper
# ---------------------------------------------------------------------------

class ImportRequest(BaseModel):
    identifier: str  # DOI, arXiv ID, or URL


@router.post("/import", status_code=201)
async def import_paper(data: ImportRequest):
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
        venue=meta.get("venue") or "Unknown",
        doi=doi,
        arxiv_id=arxiv_id,
        status="inbox",
        abstract=meta.get("abstract"),
        source="human",
        pdf_url=meta.get("pdf_url"),
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
    )
    return JSONResponse(
        {**paper.model_dump(by_alias=True), "already_exists": False},
        status_code=201,
    )


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
async def upload_pdf(paper_id: str, file: UploadFile = File(...)):
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
    return JSONResponse(updated.model_dump(by_alias=True))


@router.delete("/{paper_id}/pdf", status_code=204)
async def delete_pdf(paper_id: str):
    """Remove a paper's PDF from Supabase Storage and clear its url."""
    paper = paper_service.get_paper(paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    from services.pdf_service import delete_pdf as _delete
    _delete(paper_id)
    paper_service.set_pdf_url(paper_id, None)
