import logging
import uuid
from datetime import datetime, timezone

from models.project_paper import ProjectPaper, ProjectPaperCreate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "project_papers"


def list_project_papers(project_id: str) -> list[ProjectPaper]:
    result = (
        get_client()
        .table(_TABLE)
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    )
    return [ProjectPaper.model_validate(r) for r in result.data]


def link_paper_to_project(project_id: str, data: ProjectPaperCreate) -> ProjectPaper:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    link = ProjectPaper(
        id=f"pp_{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        created_at=now,
        **data.model_dump(by_alias=False),
    )
    get_client().table(_TABLE).insert(link.model_dump(by_alias=False)).execute()
    logger.info("Linked paper/website to project %s (link %s)", project_id, link.id)
    return link


def unlink_paper_from_project(link_id: str) -> bool:
    result = get_client().table(_TABLE).select("id").eq("id", link_id).execute()
    if not result.data:
        return False
    get_client().table(_TABLE).delete().eq("id", link_id).execute()
    logger.info("Unlinked project_paper %s", link_id)
    return True
