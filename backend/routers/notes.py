import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.note import NoteCreate, NoteUpdate
from services import note_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["notes"])

NOT_FOUND = {"error": "not_found", "detail": "Note not found"}


# ---------------------------------------------------------------------------
# Paper notes
# ---------------------------------------------------------------------------

@router.get("/papers/{paper_id}/notes")
async def list_paper_notes(paper_id: str):
    notes = note_service.list_notes(paper_id=paper_id)
    return JSONResponse([n.model_dump(by_alias=True) for n in notes])


@router.post("/papers/{paper_id}/notes", status_code=201)
async def create_paper_note(paper_id: str, data: NoteCreate):
    note = note_service.create_note(data, paper_id=paper_id)
    return JSONResponse(note.model_dump(by_alias=True), status_code=201)


class GenerateNotesRequest(BaseModel):
    library_id: Optional[str] = None


@router.post("/papers/{paper_id}/notes/generate", status_code=201)
async def generate_paper_notes(paper_id: str, data: GenerateNotesRequest):
    """Generate AI notes for a paper as a multi-file structure."""
    try:
        notes = note_service.generate_notes(paper_id, library_id=data.library_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Note generation failed for paper %s", paper_id)
        raise HTTPException(status_code=500, detail=f"Note generation failed: {exc}") from exc
    return JSONResponse([n.model_dump(by_alias=True) for n in notes], status_code=201)


# ---------------------------------------------------------------------------
# Website notes
# ---------------------------------------------------------------------------

@router.get("/websites/{website_id}/notes")
async def list_website_notes(website_id: str):
    notes = note_service.list_notes(website_id=website_id)
    return JSONResponse([n.model_dump(by_alias=True) for n in notes])


@router.post("/websites/{website_id}/notes", status_code=201)
async def create_website_note(website_id: str, data: NoteCreate):
    note = note_service.create_note(data, website_id=website_id)
    return JSONResponse(note.model_dump(by_alias=True), status_code=201)


@router.post("/websites/{website_id}/notes/generate", status_code=201)
async def generate_website_notes(website_id: str, data: GenerateNotesRequest):
    """Generate AI notes for a website as a multi-file structure."""
    try:
        notes = note_service.generate_notes_for_website(website_id, library_id=data.library_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Note generation failed for website %s", website_id)
        raise HTTPException(status_code=500, detail=f"Note generation failed: {exc}") from exc
    return JSONResponse([n.model_dump(by_alias=True) for n in notes], status_code=201)


# ---------------------------------------------------------------------------
# GitHub repo notes
# ---------------------------------------------------------------------------

@router.get("/github-repos/{repo_id}/notes")
async def list_github_repo_notes(repo_id: str):
    notes = note_service.list_notes(github_repo_id=repo_id)
    return JSONResponse([n.model_dump(by_alias=True) for n in notes])


@router.post("/github-repos/{repo_id}/notes", status_code=201)
async def create_github_repo_note(repo_id: str, data: NoteCreate):
    note = note_service.create_note(data, github_repo_id=repo_id)
    return JSONResponse(note.model_dump(by_alias=True), status_code=201)


@router.post("/github-repos/{repo_id}/notes/generate", status_code=201)
async def generate_github_repo_notes(repo_id: str, data: GenerateNotesRequest):
    """Generate AI notes for a GitHub repo as a multi-file structure."""
    try:
        notes = note_service.generate_notes_for_github_repo(repo_id, library_id=data.library_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Note generation failed for github_repo %s", repo_id)
        raise HTTPException(status_code=500, detail=f"Note generation failed: {exc}") from exc
    return JSONResponse([n.model_dump(by_alias=True) for n in notes], status_code=201)


# ---------------------------------------------------------------------------
# Shared note operations (update / delete by note ID)
# ---------------------------------------------------------------------------

@router.patch("/notes/{note_id}")
async def update_note(note_id: str, data: NoteUpdate):
    note = note_service.update_note(note_id, data)
    if note is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(note.model_dump(by_alias=True))


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: str):
    deleted = note_service.delete_note(note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)


# ---------------------------------------------------------------------------
# Library-level notes (not tied to a specific paper/website/repo)
# ---------------------------------------------------------------------------

@router.get("/libraries/{library_id}/notes")
async def list_library_notes(library_id: str):
    notes = note_service.list_notes(library_id=library_id)
    return JSONResponse([n.model_dump(by_alias=True) for n in notes])


@router.post("/libraries/{library_id}/notes", status_code=201)
async def create_library_note(library_id: str, data: NoteCreate):
    note = note_service.create_note(data, library_id=library_id)
    return JSONResponse(note.model_dump(by_alias=True), status_code=201)
