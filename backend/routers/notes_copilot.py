"""
Router for the Notes-page AI Copilot.

Endpoints:
  GET    /api/libraries/{id}/notes-copilot          list chat history
  POST   /api/libraries/{id}/notes-copilot          send a message (agentic)
  DELETE /api/libraries/{id}/notes-copilot          clear chat history
"""

import logging

from fastapi import APIRouter, HTTPException

from models.chat import NotesCopilotMessageCreate
from services import notes_copilot_service

logger = logging.getLogger(__name__)

NOT_FOUND = {"error": "not_found", "detail": "Library not found."}

router = APIRouter(prefix="/api/libraries", tags=["notes-copilot"])


@router.get("/{library_id}/notes-copilot")
def list_notes_copilot_messages(library_id: str):
    """Return all chat messages for the Notes-page copilot in this library."""
    messages = notes_copilot_service.list_messages(library_id)
    return [m.model_dump(by_alias=True) for m in messages]


@router.post("/{library_id}/notes-copilot")
def send_notes_copilot_message(library_id: str, body: NotesCopilotMessageCreate):
    """
    Send a user message to the Notes-page copilot and get an assistant response.

    The response may include note edit/create suggestions produced by the
    agentic loop (the model can call read_note / list_item_notes internally
    before producing suggestions).
    """
    try:
        response = notes_copilot_service.generate_response(
            library_id=library_id,
            user_content=body.content,
            context_items=body.context_items,
            history=body.history,
        )
    except Exception as e:
        logger.exception("Notes copilot error for library %s", library_id)
        raise HTTPException(status_code=500, detail=str(e)) from e

    return response.model_dump(by_alias=True)


@router.delete("/{library_id}/notes-copilot", status_code=204)
def clear_notes_copilot_history(library_id: str):
    """Delete all copilot chat messages for this library."""
    notes_copilot_service.clear_history(library_id)
