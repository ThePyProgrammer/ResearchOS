from typing import Any, Literal, Optional

from .base import CamelModel


class ExperimentImportItem(CamelModel):
    """A single experiment node in a BFS-ordered bulk import request."""
    tmp_id: str
    parent_tmp_id: Optional[str] = None
    name: str
    config: dict[str, Any] = {}
    metrics: dict[str, Any] = {}
    collision_action: Literal["create", "update", "skip"] = "create"
    existing_id: Optional[str] = None


class ExperimentImportRequest(CamelModel):
    """Bulk import request: BFS-ordered items + optional root target group."""
    items: list[ExperimentImportItem]  # BFS-ordered, parents first
    parent_id: Optional[str] = None    # root target group (None = top-level)
    merge_metrics: bool = False


class ExperimentImportResult(CamelModel):
    """Result for a single imported experiment."""
    tmp_id: str
    status: Literal["created", "updated", "skipped"]
    id: Optional[str] = None


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
