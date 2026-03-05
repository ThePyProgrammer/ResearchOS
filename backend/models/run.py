from typing import Optional, Any
from .base import CamelModel


class RunLog(CamelModel):
    time: str
    level: str
    message: str


class TraceStep(CamelModel):
    step: str
    status: str  # done, pending, running
    detail: str


class Run(CamelModel):
    id: str
    workflow_id: Optional[str] = None
    workflow_name: str
    prompt: Optional[str] = None
    target_collection: Optional[str] = None
    target_collection_id: Optional[str] = None
    constraints: Optional[list[str]] = None
    started_at: str
    started_by: str
    duration: Optional[str] = None
    status: str  # running, completed, failed
    progress: Optional[int] = None
    current_step: Optional[str] = None
    logs: Optional[list[RunLog]] = None
    cost: Optional[dict[str, Any]] = None
    trace: Optional[list[TraceStep]] = None


class RunCreate(CamelModel):
    workflow_id: str
    prompt: Optional[str] = None
    target_collection: Optional[str] = None
    constraints: Optional[list[str]] = None
