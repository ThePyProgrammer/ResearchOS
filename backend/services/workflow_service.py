import logging
from typing import Optional

from models.workflow import Workflow
from services.storage import load_json

logger = logging.getLogger(__name__)

_FILE = "workflows.json"


def _load() -> list[Workflow]:
    raw = load_json(_FILE)
    return [Workflow.model_validate(w) for w in raw]


def list_workflows() -> list[Workflow]:
    return _load()


def get_workflow(workflow_id: str) -> Optional[Workflow]:
    workflows = _load()
    return next((w for w in workflows if w.id == workflow_id), None)
