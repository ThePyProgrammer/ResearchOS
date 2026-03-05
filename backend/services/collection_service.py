import logging
import uuid
from typing import Optional

from models.collection import Collection, CollectionCreate, CollectionUpdate
from services.storage import load_json, save_json

logger = logging.getLogger(__name__)

_FILE = "collections.json"
_PAPERS_FILE = "papers.json"


def _load() -> list[Collection]:
    raw = load_json(_FILE)
    return [Collection.model_validate(c) for c in raw]


def _save(collections: list[Collection]) -> None:
    save_json(_FILE, [c.model_dump(by_alias=False) for c in collections])


def _compute_paper_counts(collections: list[Collection]) -> list[Collection]:
    papers_raw = load_json(_PAPERS_FILE)
    counts: dict[str, int] = {}
    for paper in papers_raw:
        for cid in paper.get("collections", []):
            counts[cid] = counts.get(cid, 0) + 1
    return [c.model_copy(update={"paper_count": counts.get(c.id, 0)}) for c in collections]


def list_collections() -> list[Collection]:
    collections = _load()
    return _compute_paper_counts(collections)


def get_collection(collection_id: str) -> Optional[Collection]:
    collections = _load()
    col = next((c for c in collections if c.id == collection_id), None)
    if col is None:
        return None
    [computed] = _compute_paper_counts([col])
    return computed


def create_collection(data: CollectionCreate) -> Collection:
    collections = _load()
    col = Collection(
        id=f"c_{uuid.uuid4().hex[:8]}",
        paper_count=0,
        **data.model_dump(),
    )
    collections.append(col)
    _save(collections)
    logger.info("Created collection %s: %s", col.id, col.name)
    return col


def update_collection(collection_id: str, data: CollectionUpdate) -> Optional[Collection]:
    collections = _load()
    idx = next((i for i, c in enumerate(collections) if c.id == collection_id), None)
    if idx is None:
        return None
    updates = data.model_dump(exclude_none=True)
    updated = collections[idx].model_copy(update=updates)
    collections[idx] = updated
    _save(collections)
    logger.info("Updated collection %s: %s", collection_id, updates)
    return updated


def delete_collection(collection_id: str) -> bool:
    collections = _load()
    filtered = [c for c in collections if c.id != collection_id]
    if len(filtered) == len(collections):
        return False
    _save(filtered)
    logger.info("Deleted collection %s", collection_id)
    return True
