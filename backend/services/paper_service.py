import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.paper import Paper, PaperCreate, PaperUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "papers"


def iter_papers(*, library_id: str | None = None, all_libraries: bool = False,
                page_size: int = 500):
    """Stable keyset traversal, bounded by the initial maximum ID."""
    if not all_libraries and not library_id:
        raise ValueError("Select a library or explicitly select all libraries")
    if not 1 <= page_size <= 1000:
        raise ValueError("page_size must be between 1 and 1000")

    def scoped_query(fields):
        query = get_client().table(_TABLE).select(fields)
        return query if all_libraries else query.eq("library_id", library_id)

    top = scoped_query("id").order("id", desc=True).limit(1).execute().data
    if not top:
        return
    upper = top[0]["id"]
    after = None
    while True:
        query = scoped_query("*").lte("id", upper).order("id").limit(page_size)
        if after is not None:
            query = query.gt("id", after)
        rows = query.execute().data
        if not rows:
            return
        yield from rows
        after = rows[-1]["id"]


def list_papers(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    library_id: Optional[str] = None,
) -> list[Paper]:
    query = get_client().table(_TABLE).select("*")
    if library_id:
        query = query.eq("library_id", library_id)
    if collection_id == "inbox":
        query = query.eq("status", "inbox")
    elif collection_id and collection_id != "all":
        query = query.contains("collections", [collection_id])
    if status:
        query = query.eq("status", status)
    query = query.order("published_date", desc=False)
    result = query.execute()
    papers = [Paper.model_validate(p) for p in result.data]


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
    get_client().table(_TABLE).insert(paper.model_dump(by_alias=False, exclude={"has_stored_pdf", "pdf_revision"})).execute()
    logger.info("Created paper %s: %s", paper.id, paper.title)
    return paper


def update_paper(paper_id: str, data: PaperUpdate) -> Optional[Paper]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_paper(paper_id)
    result = get_client().table(_TABLE).update(updates).eq("id", paper_id).execute()
    if not result.data:
        return None
    logger.info("Updated paper %s: %s", paper_id, list(updates.keys()))
    return Paper.model_validate(result.data[0])


def set_pdf_url(paper_id: str, pdf_url: Optional[str]) -> None:
    """Directly set (or clear) the pdf_url field, bypassing PaperUpdate exclude_none logic."""
    get_client().table(_TABLE).update({"pdf_url": pdf_url}).eq("id", paper_id).execute()
    logger.info("Set pdf_url for paper %s: %s", paper_id, pdf_url)


def delete_paper(paper_id: str) -> bool:
    paper = get_paper(paper_id)
    if paper is None:
        return False
    from services.pdf_service import delete_pdf
    delete_pdf(paper_id, paper.pdf_url)
    get_client().table(_TABLE).delete().eq("id", paper_id).execute()
    logger.info("Deleted paper %s", paper_id)
    return True
