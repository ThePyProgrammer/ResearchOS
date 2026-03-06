import logging
from typing import Optional

from models.workflow import Workflow
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "workflows"


def list_workflows() -> list[Workflow]:
    result = get_client().table(_TABLE).select("*").execute()
    return [Workflow.model_validate(w) for w in result.data]


def get_workflow(workflow_id: str) -> Optional[Workflow]:
    result = get_client().table(_TABLE).select("*").eq("id", workflow_id).execute()
    if not result.data:
        return None
    return Workflow.model_validate(result.data[0])
