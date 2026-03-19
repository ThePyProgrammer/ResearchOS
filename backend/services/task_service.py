import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.task import (
    Task,
    TaskCreate,
    TaskUpdate,
    TaskColumn,
    TaskColumnCreate,
    TaskColumnUpdate,
    TaskFieldDef,
    TaskFieldDefCreate,
    TaskFieldDefUpdate,
)
from services.db import get_client

logger = logging.getLogger(__name__)

_COL_TABLE = "task_columns"
_TASK_TABLE = "tasks"
_FD_TABLE = "task_field_defs"

# Default columns seeded on first project access
_DEFAULT_COLUMNS = [
    {"name": "Todo",        "color": "#93c5fd"},
    {"name": "In Progress", "color": "#fbbf24"},
    {"name": "Review",      "color": "#a78bfa"},
    {"name": "Done",        "color": "#4ade80"},
]


# ---------------------------------------------------------------------------
# Task Column CRUD
# ---------------------------------------------------------------------------

def list_or_seed_task_columns(project_id: str) -> list[TaskColumn]:
    """Return task columns ordered by position; auto-seed 4 defaults if none exist."""
    result = (
        get_client()
        .table(_COL_TABLE)
        .select("*")
        .eq("project_id", project_id)
        .order("position")
        .execute()
    )
    if result.data:
        return [TaskColumn.model_validate(r) for r in result.data]

    # Seed default columns
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    seeded = []
    for position, default in enumerate(_DEFAULT_COLUMNS):
        col = TaskColumn(
            id=f"tcol_{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            name=default["name"],
            color=default["color"],
            position=position,
            created_at=now,
        )
        get_client().table(_COL_TABLE).insert(col.model_dump(by_alias=False)).execute()
        seeded.append(col)
        logger.info("Seeded default task column '%s' for project %s", col.name, project_id)

    return seeded


def get_task_column(col_id: str) -> Optional[TaskColumn]:
    result = get_client().table(_COL_TABLE).select("*").eq("id", col_id).execute()
    if not result.data:
        return None
    return TaskColumn.model_validate(result.data[0])


def create_task_column(project_id: str, data: TaskColumnCreate) -> TaskColumn:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    # Determine next position
    existing = get_client().table(_COL_TABLE).select("position").eq("project_id", project_id).execute()
    max_pos = max((r["position"] for r in existing.data), default=-1)
    col = TaskColumn(
        id=f"tcol_{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        name=data.name,
        color=data.color or "#94a3b8",
        position=max_pos + 1,
        created_at=now,
    )
    get_client().table(_COL_TABLE).insert(col.model_dump(by_alias=False)).execute()
    logger.info("Created task column '%s' for project %s", col.name, project_id)
    return col


def update_task_column(col_id: str, data: TaskColumnUpdate) -> Optional[TaskColumn]:
    updates = data.model_dump(exclude_unset=True)
    if get_task_column(col_id) is None:
        return None
    if not updates:
        return get_task_column(col_id)
    get_client().table(_COL_TABLE).update(updates).eq("id", col_id).execute()
    logger.info("Updated task column %s: %s", col_id, list(updates.keys()))
    return get_task_column(col_id)


def delete_task_column(col_id: str, move_to_col_id: str) -> bool:
    """Delete a column, moving all its tasks to move_to_col_id first."""
    if get_task_column(col_id) is None:
        return False
    # Move all tasks to the target column before deleting
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    get_client().table(_TASK_TABLE).update(
        {"column_id": move_to_col_id, "updated_at": now}
    ).eq("column_id", col_id).execute()
    get_client().table(_COL_TABLE).delete().eq("id", col_id).execute()
    logger.info("Deleted task column %s (tasks moved to %s)", col_id, move_to_col_id)
    return True


# ---------------------------------------------------------------------------
# Task CRUD
# ---------------------------------------------------------------------------

def list_tasks(project_id: str) -> list[Task]:
    result = (
        get_client()
        .table(_TASK_TABLE)
        .select("*")
        .eq("project_id", project_id)
        .order("position")
        .execute()
    )
    return [Task.model_validate(r) for r in result.data]


def get_task(task_id: str) -> Optional[Task]:
    result = get_client().table(_TASK_TABLE).select("*").eq("id", task_id).execute()
    if not result.data:
        return None
    return Task.model_validate(result.data[0])


def create_task(project_id: str, data: TaskCreate) -> Task:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    # Determine next position within the column
    existing = (
        get_client()
        .table(_TASK_TABLE)
        .select("position")
        .eq("column_id", data.column_id)
        .execute()
    )
    max_pos = max((r["position"] for r in existing.data), default=-1)
    task = Task(
        id=f"task_{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        column_id=data.column_id,
        title=data.title,
        description=data.description,
        priority=data.priority,
        due_date=data.due_date,
        tags=data.tags if data.tags is not None else [],
        custom_fields=data.custom_fields if data.custom_fields is not None else {},
        position=max_pos + 1,
        created_at=now,
        updated_at=now,
    )
    get_client().table(_TASK_TABLE).insert(task.model_dump(by_alias=False)).execute()
    logger.info("Created task '%s' in column %s for project %s", task.title, data.column_id, project_id)
    return task


def update_task(task_id: str, data: TaskUpdate) -> Optional[Task]:
    updates = data.model_dump(exclude_unset=True)
    if get_task(task_id) is None:
        return None
    if not updates:
        return get_task(task_id)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    get_client().table(_TASK_TABLE).update(updates).eq("id", task_id).execute()
    logger.info("Updated task %s: %s", task_id, list(updates.keys()))
    return get_task(task_id)


def delete_task(task_id: str) -> bool:
    if get_task(task_id) is None:
        return False
    get_client().table(_TASK_TABLE).delete().eq("id", task_id).execute()
    logger.info("Deleted task %s", task_id)
    return True


# ---------------------------------------------------------------------------
# Task Field Definition CRUD
# ---------------------------------------------------------------------------

def list_task_field_defs(project_id: str) -> list[TaskFieldDef]:
    result = (
        get_client()
        .table(_FD_TABLE)
        .select("*")
        .eq("project_id", project_id)
        .order("position")
        .execute()
    )
    return [TaskFieldDef.model_validate(r) for r in result.data]


def get_task_field_def(def_id: str) -> Optional[TaskFieldDef]:
    result = get_client().table(_FD_TABLE).select("*").eq("id", def_id).execute()
    if not result.data:
        return None
    return TaskFieldDef.model_validate(result.data[0])


def create_task_field_def(project_id: str, data: TaskFieldDefCreate) -> TaskFieldDef:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    existing = get_client().table(_FD_TABLE).select("position").eq("project_id", project_id).execute()
    max_pos = max((r["position"] for r in existing.data), default=-1)
    fd = TaskFieldDef(
        id=f"tfd_{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        name=data.name,
        field_type=data.field_type,
        options=data.options if data.options is not None else [],
        position=max_pos + 1,
        created_at=now,
    )
    get_client().table(_FD_TABLE).insert(fd.model_dump(by_alias=False)).execute()
    logger.info("Created task field def '%s' for project %s", fd.name, project_id)
    return fd


def update_task_field_def(def_id: str, data: TaskFieldDefUpdate) -> Optional[TaskFieldDef]:
    updates = data.model_dump(exclude_unset=True)
    if get_task_field_def(def_id) is None:
        return None
    if not updates:
        return get_task_field_def(def_id)
    get_client().table(_FD_TABLE).update(updates).eq("id", def_id).execute()
    logger.info("Updated task field def %s: %s", def_id, list(updates.keys()))
    return get_task_field_def(def_id)


def delete_task_field_def(def_id: str) -> bool:
    if get_task_field_def(def_id) is None:
        return False
    get_client().table(_FD_TABLE).delete().eq("id", def_id).execute()
    logger.info("Deleted task field def %s", def_id)
    return True
