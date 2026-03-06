import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.library import Library, LibraryCreate, LibraryUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "libraries"


def list_libraries() -> list[Library]:
    result = get_client().table(_TABLE).select("*").order("created_at").execute()
    return [Library.model_validate(r) for r in result.data]


def get_library(library_id: str) -> Optional[Library]:
    result = get_client().table(_TABLE).select("*").eq("id", library_id).execute()
    if not result.data:
        return None
    return Library.model_validate(result.data[0])


def create_library(data: LibraryCreate) -> Library:
    now = datetime.now(timezone.utc).isoformat()
    lib = Library(id=f"lib_{uuid.uuid4().hex[:8]}", created_at=now, **data.model_dump())
    get_client().table(_TABLE).insert(lib.model_dump(by_alias=False)).execute()
    logger.info("Created library %s: %s", lib.id, lib.name)
    return lib


def update_library(library_id: str, data: LibraryUpdate) -> Optional[Library]:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return get_library(library_id)
    result = (
        get_client()
        .table(_TABLE)
        .update(updates)
        .eq("id", library_id)
        .select()
        .execute()
    )
    if not result.data:
        return None
    logger.info("Updated library %s: %s", library_id, list(updates.keys()))
    return Library.model_validate(result.data[0])


def delete_library(library_id: str) -> bool:
    result = (
        get_client()
        .table(_TABLE)
        .delete()
        .eq("id", library_id)
        .select()
        .execute()
    )
    deleted = bool(result.data)
    if deleted:
        logger.info("Deleted library %s", library_id)
    return deleted
