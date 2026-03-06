import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.note import Note, NoteCreate, NoteUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "notes"


def list_notes(paper_id: str) -> list[Note]:
    result = get_client().table(_TABLE).select("*").eq("paper_id", paper_id).execute()
    return [Note.model_validate(r) for r in result.data]


def get_note(note_id: str) -> Optional[Note]:
    result = get_client().table(_TABLE).select("*").eq("id", note_id).execute()
    if not result.data:
        return None
    return Note.model_validate(result.data[0])


def create_note(paper_id: str, data: NoteCreate) -> Note:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    note = Note(
        id=f"note_{uuid.uuid4().hex[:8]}",
        paper_id=paper_id,
        name=data.name,
        parent_id=data.parent_id,
        type=data.type,
        content=data.content,
        created_at=now,
        updated_at=now,
    )
    get_client().table(_TABLE).insert(note.model_dump(by_alias=False)).execute()
    logger.info("Created note '%s' for paper %s", data.name, paper_id)
    return note


def update_note(note_id: str, data: NoteUpdate) -> Optional[Note]:
    existing = get_note(note_id)
    if existing is None:
        return None
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return existing
    updates["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    get_client().table(_TABLE).update(updates).eq("id", note_id).execute()
    return get_note(note_id)


def delete_note(note_id: str) -> bool:
    existing = get_note(note_id)
    if existing is None:
        return False
    # Recursively delete children if this is a folder
    if existing.type == "folder":
        children = get_client().table(_TABLE).select("id").eq("parent_id", note_id).execute()
        for child in children.data:
            delete_note(child["id"])
    get_client().table(_TABLE).delete().eq("id", note_id).execute()
    logger.info("Deleted note %s", note_id)
    return True
