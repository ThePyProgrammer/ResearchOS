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


@router.get("/papers/{paper_id}/notes")
async def list_notes(paper_id: str):
    notes = note_service.list_notes(paper_id)
    return JSONResponse([n.model_dump(by_alias=True) for n in notes])


@router.post("/papers/{paper_id}/notes", status_code=201)
async def create_note(paper_id: str, data: NoteCreate):
    note = note_service.create_note(paper_id, data)
    return JSONResponse(note.model_dump(by_alias=True), status_code=201)


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


class GenerateNotesRequest(BaseModel):
    library_id: Optional[str] = None


@router.post("/papers/{paper_id}/notes/generate", status_code=201)
async def generate_notes(paper_id: str, data: GenerateNotesRequest):
    """Generate an AI overview note for a paper using library auto-note settings."""
    try:
        note = note_service.generate_notes(paper_id, library_id=data.library_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Note generation failed for paper %s", paper_id)
        raise HTTPException(status_code=500, detail=f"Note generation failed: {exc}") from exc
    return JSONResponse(note.model_dump(by_alias=True), status_code=201)
