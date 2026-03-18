"""
Router for the Project Notes AI Copilot.

Endpoints:
  GET    /api/projects/{id}/notes-copilot    list chat history
  POST   /api/projects/{id}/notes-copilot    send a message (agentic)
  DELETE /api/projects/{id}/notes-copilot    clear chat history
"""

import logging

from fastapi import APIRouter, HTTPException

from models.chat import ProjectNotesCopilotMessageCreate
from services import project_notes_copilot_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["project-notes-copilot"])


@router.get("/{project_id}/notes-copilot")
def list_project_notes_copilot_messages(project_id: str):
    """Return all chat messages for the Notes-page copilot in this project."""
    messages = project_notes_copilot_service.list_messages(project_id)
    return [m.model_dump(by_alias=True) for m in messages]


@router.post("/{project_id}/notes-copilot")
def send_project_notes_copilot_message(project_id: str, body: ProjectNotesCopilotMessageCreate):
    """
    Send a user message to the project Notes copilot and get an assistant response.

    The response may include note edit/create suggestions produced by the
    agentic loop (the model can call read_note / list_item_notes internally
    before producing suggestions). Supports experiment context items with
    config/metrics/children in the metadata field.
    """
    try:
        response = project_notes_copilot_service.generate_response(
            project_id=project_id,
            user_content=body.content,
            context_items=body.context_items,
            history=body.history,
        )
    except Exception as e:
        logger.exception("Project notes copilot error for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(e)) from e

    return response.model_dump(by_alias=True)


@router.delete("/{project_id}/notes-copilot", status_code=204)
def clear_project_notes_copilot_history(project_id: str):
    """Delete all copilot chat messages for this project."""
    project_notes_copilot_service.clear_history(project_id)
