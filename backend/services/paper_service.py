import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.paper import Paper, PaperCreate, PaperUpdate
from services.storage import load_json, save_json

logger = logging.getLogger(__name__)

_FILE = "papers.json"


def _load() -> list[Paper]:
    raw = load_json(_FILE)
    return [Paper.model_validate(p) for p in raw]


def _save(papers: list[Paper]) -> None:
    save_json(_FILE, [p.model_dump(by_alias=False) for p in papers])


def list_papers(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> list[Paper]:
    papers = _load()
    if collection_id == "inbox":
        papers = [p for p in papers if p.status == "inbox"]
    elif collection_id and collection_id != "all":
        papers = [p for p in papers if collection_id in p.collections]
    if status:
        papers = [p for p in papers if p.status == status]
    if search:
        q = search.lower()
        papers = [
            p for p in papers
            if q in p.title.lower()
            or any(q in a.lower() for a in p.authors)
            or any(q in t.lower() for t in p.tags)
        ]
    return papers


def get_paper(paper_id: str) -> Optional[Paper]:
    papers = _load()
    return next((p for p in papers if p.id == paper_id), None)


def create_paper(data: PaperCreate) -> Paper:
    papers = _load()
    now = datetime.now(timezone.utc).isoformat()
    paper = Paper(
        id=f"p_{uuid.uuid4().hex[:8]}",
        created_at=now,
        **data.model_dump(),
    )
    papers.append(paper)
    _save(papers)
    logger.info("Created paper %s: %s", paper.id, paper.title)
    return paper


def update_paper(paper_id: str, data: PaperUpdate) -> Optional[Paper]:
    papers = _load()
    idx = next((i for i, p in enumerate(papers) if p.id == paper_id), None)
    if idx is None:
        return None
    paper = papers[idx]
    updates = data.model_dump(exclude_none=True)
    updated = paper.model_copy(update=updates)
    papers[idx] = updated
    _save(papers)
    logger.info("Updated paper %s: %s", paper_id, updates)
    return updated


def delete_paper(paper_id: str) -> bool:
    papers = _load()
    filtered = [p for p in papers if p.id != paper_id]
    if len(filtered) == len(papers):
        return False
    _save(filtered)
    logger.info("Deleted paper %s", paper_id)
    return True
