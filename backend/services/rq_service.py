import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.research_question import ResearchQuestion, ResearchQuestionCreate, ResearchQuestionUpdate
from models.project_paper import RqPaper, RqPaperCreate
from services.db import get_client

logger = logging.getLogger(__name__)

_RQ_TABLE = "research_questions"
_RQP_TABLE = "rq_papers"


# ---------------------------------------------------------------------------
# Research Question CRUD
# ---------------------------------------------------------------------------

def list_rqs(project_id: str) -> list[ResearchQuestion]:
    result = (
        get_client()
        .table(_RQ_TABLE)
        .select("*")
        .eq("project_id", project_id)
        .order("position")
        .execute()
    )
    return [ResearchQuestion.model_validate(r) for r in result.data]


def get_rq(rq_id: str) -> Optional[ResearchQuestion]:
    result = get_client().table(_RQ_TABLE).select("*").eq("id", rq_id).execute()
    if not result.data:
        return None
    return ResearchQuestion.model_validate(result.data[0])


def create_rq(data: ResearchQuestionCreate) -> ResearchQuestion:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    rq = ResearchQuestion(
        id=f"rq_{uuid.uuid4().hex[:8]}",
        created_at=now,
        updated_at=now,
        **data.model_dump(by_alias=False),
    )
    get_client().table(_RQ_TABLE).insert(rq.model_dump(by_alias=False)).execute()
    logger.info("Created research question %s for project %s", rq.id, rq.project_id)
    return rq


def update_rq(rq_id: str, data: ResearchQuestionUpdate) -> Optional[ResearchQuestion]:
    updates = data.model_dump(exclude_unset=True)
    if get_rq(rq_id) is None:
        return None
    if not updates:
        return get_rq(rq_id)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    get_client().table(_RQ_TABLE).update(updates).eq("id", rq_id).execute()
    logger.info("Updated research question %s: %s", rq_id, list(updates.keys()))
    return get_rq(rq_id)


def delete_rq(rq_id: str) -> bool:
    if get_rq(rq_id) is None:
        return False
    get_client().table(_RQ_TABLE).delete().eq("id", rq_id).execute()
    logger.info("Deleted research question %s (DB cascade removes children)", rq_id)
    return True


def reorder_rqs(rq_ids: list[str]) -> None:
    """Update position for each RQ in the provided ordered list."""
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    for position, rq_id in enumerate(rq_ids):
        get_client().table(_RQ_TABLE).update(
            {"position": position, "updated_at": now}
        ).eq("id", rq_id).execute()
    logger.info("Reordered %d research questions", len(rq_ids))


# ---------------------------------------------------------------------------
# RQ-paper links
# ---------------------------------------------------------------------------

def list_rq_papers(rq_id: str) -> list[RqPaper]:
    result = (
        get_client()
        .table(_RQP_TABLE)
        .select("*")
        .eq("rq_id", rq_id)
        .order("created_at")
        .execute()
    )
    return [RqPaper.model_validate(r) for r in result.data]


def link_paper_to_rq(rq_id: str, data: RqPaperCreate) -> RqPaper:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    link = RqPaper(
        id=f"rqp_{uuid.uuid4().hex[:8]}",
        rq_id=rq_id,
        created_at=now,
        **data.model_dump(by_alias=False),
    )
    get_client().table(_RQP_TABLE).insert(link.model_dump(by_alias=False)).execute()
    logger.info("Linked paper/website to RQ %s (link %s)", rq_id, link.id)
    return link


def unlink_paper_from_rq(link_id: str) -> bool:
    result = get_client().table(_RQP_TABLE).select("id").eq("id", link_id).execute()
    if not result.data:
        return False
    get_client().table(_RQP_TABLE).delete().eq("id", link_id).execute()
    logger.info("Unlinked rq_paper %s", link_id)
    return True
