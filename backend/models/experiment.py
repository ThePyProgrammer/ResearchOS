from typing import Any, Literal, Optional

from .base import CamelModel


class Experiment(CamelModel):
    id: str
    project_id: str
    parent_id: Optional[str] = None
    rq_id: Optional[str] = None
    name: str
    status: str = "planned"
    config: dict[str, Any] = {}
    metrics: dict[str, Any] = {}
    position: int = 0
    created_at: str
    updated_at: str


class ExperimentCreate(CamelModel):
    project_id: str = ""
    parent_id: Optional[str] = None
    rq_id: Optional[str] = None
    name: str
    status: str = "planned"
    config: dict[str, Any] = {}
    metrics: dict[str, Any] = {}


class ExperimentUpdate(CamelModel):
    name: Optional[str] = None
    status: Optional[Literal["planned", "running", "completed", "failed"]] = None
    parent_id: Optional[str] = None
    rq_id: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    metrics: Optional[dict[str, Any]] = None
    position: Optional[int] = None


class ExperimentPaper(CamelModel):
    id: str
    experiment_id: str
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    github_repo_id: Optional[str] = None
    created_at: str


class ExperimentPaperCreate(CamelModel):
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    github_repo_id: Optional[str] = None
