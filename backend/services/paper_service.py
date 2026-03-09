import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.paper import Paper, PaperCreate, PaperUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "papers"


def list_papers(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    library_id: Optional[str] = None,
) -> list[Paper]:
    query = get_client().table(_TABLE).select("*")
    if library_id:
        query = query.eq("library_id", library_id)
    query = query.order("published_date", desc=False, nulls_first=False)
    result = query.execute()
    papers = [Paper.model_validate(p) for p in result.data]


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
    result = get_client().table(_TABLE).select("*").eq("id", paper_id).execute()
    if not result.data:
        return None
    return Paper.model_validate(result.data[0])


def create_paper(data: PaperCreate) -> Paper:
    now = datetime.now(timezone.utc).isoformat()
    paper = Paper(
        id=f"p_{uuid.uuid4().hex[:8]}",
        created_at=now,
        **data.model_dump(),
    )
    get_client().table(_TABLE).insert(paper.model_dump(by_alias=False)).execute()
    logger.info("Created paper %s: %s", paper.id, paper.title)
    return paper


def update_paper(paper_id: str, data: PaperUpdate) -> Optional[Paper]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_paper(paper_id)
    if get_paper(paper_id) is None:
        return None
    get_client().table(_TABLE).update(updates).eq("id", paper_id).execute()
    logger.info("Updated paper %s: %s", paper_id, list(updates.keys()))
    return get_paper(paper_id)


def set_pdf_url(paper_id: str, pdf_url: Optional[str]) -> None:
    """Directly set (or clear) the pdf_url field, bypassing PaperUpdate exclude_none logic."""
    get_client().table(_TABLE).update({"pdf_url": pdf_url}).eq("id", paper_id).execute()
    logger.info("Set pdf_url for paper %s: %s", paper_id, pdf_url)


def delete_paper(paper_id: str) -> bool:
    if get_paper(paper_id) is None:
        return False
    get_client().table(_TABLE).delete().eq("id", paper_id).execute()
    logger.info("Deleted paper %s", paper_id)
    return True
