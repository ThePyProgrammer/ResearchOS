import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.run import Run, RunCreate, RunLog, TraceStep
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "runs"


def list_runs() -> list[Run]:
    result = get_client().table(_TABLE).select("*").execute()
    return [Run.model_validate(r) for r in result.data]


def get_run(run_id: str) -> Optional[Run]:
    result = get_client().table(_TABLE).select("*").eq("id", run_id).execute()
    if not result.data:
        return None
    return Run.model_validate(result.data[0])


def create_run(data: RunCreate, started_by: str = "Dr. Researcher") -> Run:
    now = datetime.now(timezone.utc).isoformat()

    from services.workflow_service import get_workflow
    wf = get_workflow(data.workflow_id)
    workflow_name = wf.name if wf else data.workflow_id

    run = Run(
        id=f"run_{uuid.uuid4().hex[:8]}",
        workflow_id=data.workflow_id,
        workflow_name=workflow_name,
        prompt=data.prompt,
        target_collection=data.target_collection,
        constraints=data.constraints,
        started_at=now,
        started_by=started_by,
        status="running",
        progress=0,
        logs=[],
    )
    get_client().table(_TABLE).insert(run.model_dump(by_alias=False)).execute()
    logger.info("Created run %s for workflow %s", run.id, data.workflow_id)
    return run


def append_log(run_id: str, time: str, level: str, message: str) -> None:
    run = get_run(run_id)
    if run is None:
        logger.warning("append_log: run %s not found", run_id)
        return
    logs = list(run.logs or [])
    logs.append(RunLog(time=time, level=level, message=message))
    (
        get_client()
        .table(_TABLE)
        .update({"logs": [log.model_dump() for log in logs]})
        .eq("id", run_id)
        .execute()
    )


def update_progress(run_id: str, progress: int, current_step: str) -> None:
    (
        get_client()
        .table(_TABLE)
        .update({"progress": progress, "current_step": current_step})
        .eq("id", run_id)
        .execute()
    )


def complete_run(
    run_id: str,
    trace: Optional[list[dict]] = None,
    cost: Optional[dict] = None,
) -> None:
    updates: dict = {"status": "completed", "progress": 100, "current_step": None}
    if trace:
        updates["trace"] = [TraceStep(**t).model_dump() for t in trace]
    if cost:
        updates["cost"] = cost
    get_client().table(_TABLE).update(updates).eq("id", run_id).execute()
    logger.info("Run %s completed", run_id)


def fail_run(run_id: str, error: str) -> None:
    (
        get_client()
        .table(_TABLE)
        .update({"status": "failed", "current_step": f"Error: {error[:120]}"})
        .eq("id", run_id)
        .execute()
    )
    logger.error("Run %s failed: %s", run_id, error)
