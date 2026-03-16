import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.project import Project, ProjectCreate, ProjectUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "projects"


def list_projects(library_id: Optional[str] = None) -> list[Project]:
    query = get_client().table(_TABLE).select("*").order("created_at")
    if library_id:
        query = query.eq("library_id", library_id)
    result = query.execute()
    projects = [Project.model_validate(r) for r in result.data]
    if not projects:
        return projects

    # Count experiments per project
    project_ids = [p.id for p in projects]
    exp_result = get_client().table("experiments").select("project_id").in_("project_id", project_ids).execute()
    count_map: dict[str, int] = {}
    for row in exp_result.data:
        pid = row["project_id"]
        count_map[pid] = count_map.get(pid, 0) + 1
    for p in projects:
        p.experiment_count = count_map.get(p.id, 0)
    return projects


def get_project(project_id: str) -> Optional[Project]:
    result = get_client().table(_TABLE).select("*").eq("id", project_id).execute()
    if not result.data:
        return None
    return Project.model_validate(result.data[0])


def create_project(data: ProjectCreate) -> Project:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    project = Project(
        id=f"proj_{uuid.uuid4().hex[:8]}",
        created_at=now,
        updated_at=now,
        **data.model_dump(by_alias=False),
    )
    get_client().table(_TABLE).insert(project.model_dump(by_alias=False, exclude={"experiment_count"})).execute()
    logger.info("Created project %s: %s", project.id, project.name)
    return project


def update_project(project_id: str, data: ProjectUpdate) -> Optional[Project]:
    updates = data.model_dump(exclude_unset=True)
    if get_project(project_id) is None:
        return None
    if not updates:
        return get_project(project_id)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    get_client().table(_TABLE).update(updates).eq("id", project_id).execute()
    logger.info("Updated project %s: %s", project_id, list(updates.keys()))
    return get_project(project_id)


def delete_project(project_id: str) -> bool:
    if get_project(project_id) is None:
        return False
    get_client().table(_TABLE).delete().eq("id", project_id).execute()
    logger.info("Deleted project %s", project_id)
    return True
