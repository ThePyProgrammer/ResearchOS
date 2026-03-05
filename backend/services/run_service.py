import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.run import Run, RunCreate
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
    run = Run(
        id=f"run_{uuid.uuid4().hex[:8]}",
        workflow_id=data.workflow_id,
        workflow_name=f"Run: {data.workflow_id}",
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
