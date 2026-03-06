import logging
import uuid
from typing import Optional

from models.collection import Collection, CollectionCreate, CollectionUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "collections"
_PAPERS_TABLE = "papers"


def _compute_paper_counts(collections: list[Collection]) -> list[Collection]:
    result = get_client().table(_PAPERS_TABLE).select("collections").execute()
    counts: dict[str, int] = {}
    for row in result.data:
        for cid in (row.get("collections") or []):
            counts[cid] = counts.get(cid, 0) + 1
    return [c.model_copy(update={"paper_count": counts.get(c.id, 0)}) for c in collections]


def list_collections() -> list[Collection]:
    result = get_client().table(_TABLE).select("*").execute()
    collections = [Collection.model_validate(c) for c in result.data]
    return _compute_paper_counts(collections)


def get_collection(collection_id: str) -> Optional[Collection]:
    result = get_client().table(_TABLE).select("*").eq("id", collection_id).execute()
    if not result.data:
        return None
    col = Collection.model_validate(result.data[0])
    [computed] = _compute_paper_counts([col])
    return computed


def create_collection(data: CollectionCreate) -> Collection:
    col = Collection(
        id=f"c_{uuid.uuid4().hex[:8]}",
        paper_count=0,
        **data.model_dump(),
    )
    row = {k: v for k, v in col.model_dump(by_alias=False).items() if k != "paper_count"}
    get_client().table(_TABLE).insert(row).execute()
    logger.info("Created collection %s: %s", col.id, col.name)
    return col


def update_collection(collection_id: str, data: CollectionUpdate) -> Optional[Collection]:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return get_collection(collection_id)
    if get_collection(collection_id) is None:
        return None
    get_client().table(_TABLE).update(updates).eq("id", collection_id).execute()
    logger.info("Updated collection %s: %s", collection_id, list(updates.keys()))
    return get_collection(collection_id)


def delete_collection(collection_id: str) -> bool:
    if get_collection(collection_id) is None:
        return False
    get_client().table(_TABLE).delete().eq("id", collection_id).execute()
    logger.info("Deleted collection %s", collection_id)
    return True
