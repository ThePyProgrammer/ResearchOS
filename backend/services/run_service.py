import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.run import Run, RunCreate, RunLog, TraceStep
from services.storage import load_json, save_json

logger = logging.getLogger(__name__)

_FILE = "runs.json"


def _load() -> list[Run]:
    raw = load_json(_FILE)
    return [Run.model_validate(r) for r in raw]


def _save(runs: list[Run]) -> None:
    save_json(_FILE, [r.model_dump(by_alias=False) for r in runs])


def list_runs() -> list[Run]:
    return _load()


def get_run(run_id: str) -> Optional[Run]:
    runs = _load()
    return next((r for r in runs if r.id == run_id), None)


def create_run(data: RunCreate, started_by: str = "Dr. Researcher") -> Run:
    runs = _load()
    now = datetime.now(timezone.utc).isoformat()

    # Resolve workflow name from catalog
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
    runs.append(run)
    _save(runs)
    logger.info("Created run %s for workflow %s", run.id, data.workflow_id)
    return run


def append_log(run_id: str, time: str, level: str, message: str) -> None:
    """Append a log entry to the run record."""
    runs = _load()
    idx = next((i for i, r in enumerate(runs) if r.id == run_id), None)
    if idx is None:
        logger.warning("append_log: run %s not found", run_id)
        return
    run = runs[idx]
    logs = list(run.logs or [])
    logs.append(RunLog(time=time, level=level, message=message))
    runs[idx] = run.model_copy(update={"logs": logs})
    _save(runs)


def update_progress(run_id: str, progress: int, current_step: str) -> None:
    """Update run progress percentage and current step label."""
    runs = _load()
    idx = next((i for i, r in enumerate(runs) if r.id == run_id), None)
    if idx is None:
        return
    runs[idx] = runs[idx].model_copy(
        update={"progress": progress, "current_step": current_step}
    )
    _save(runs)


def complete_run(
    run_id: str,
    trace: Optional[list[dict]] = None,
    cost: Optional[dict] = None,
) -> None:
    """Mark run as completed with final trace and optional cost breakdown."""
    runs = _load()
    idx = next((i for i, r in enumerate(runs) if r.id == run_id), None)
    if idx is None:
        return
    updates: dict = {"status": "completed", "progress": 100, "current_step": None}
    if trace:
        updates["trace"] = [TraceStep(**t) for t in trace]
    if cost:
        updates["cost"] = cost
    runs[idx] = runs[idx].model_copy(update=updates)
    _save(runs)
    logger.info("Run %s completed", run_id)


def fail_run(run_id: str, error: str) -> None:
    """Mark run as failed with an error message in the current_step field."""
    runs = _load()
    idx = next((i for i, r in enumerate(runs) if r.id == run_id), None)
    if idx is None:
        return
    runs[idx] = runs[idx].model_copy(
        update={"status": "failed", "current_step": f"Error: {error[:120]}"}
    )
    _save(runs)
    logger.error("Run %s failed: %s", run_id, error)
