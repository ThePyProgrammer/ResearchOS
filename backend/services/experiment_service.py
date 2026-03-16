import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.experiment import (
    Experiment,
    ExperimentCreate,
    ExperimentUpdate,
    ExperimentPaper,
    ExperimentPaperCreate,
)
from services.db import get_client

logger = logging.getLogger(__name__)

_EXP_TABLE = "experiments"
_EP_TABLE = "experiment_papers"


# ---------------------------------------------------------------------------
# Experiment CRUD
# ---------------------------------------------------------------------------

def list_experiments(project_id: str) -> list[Experiment]:
    result = (
        get_client()
        .table(_EXP_TABLE)
        .select("*")
        .eq("project_id", project_id)
        .order("position")
        .execute()
    )
    return [Experiment.model_validate(r) for r in result.data]


def get_experiment(exp_id: str) -> Optional[Experiment]:
    result = get_client().table(_EXP_TABLE).select("*").eq("id", exp_id).execute()
    if not result.data:
        return None
    return Experiment.model_validate(result.data[0])


def create_experiment(data: ExperimentCreate) -> Experiment:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    exp = Experiment(
        id=f"exp_{uuid.uuid4().hex[:8]}",
        project_id=data.project_id,
        parent_id=data.parent_id,
        rq_id=data.rq_id,
        name=data.name,
        status=data.status,
        config=data.config if data.config is not None else {},
        metrics=data.metrics if data.metrics is not None else {},
        position=0,
        created_at=now,
        updated_at=now,
    )
    get_client().table(_EXP_TABLE).insert(exp.model_dump(by_alias=False)).execute()
    logger.info("Created experiment %s for project %s", exp.id, exp.project_id)
    return exp


def update_experiment(exp_id: str, data: ExperimentUpdate) -> Optional[Experiment]:
    updates = data.model_dump(exclude_unset=True)
    if get_experiment(exp_id) is None:
        return None
    if not updates:
        return get_experiment(exp_id)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    get_client().table(_EXP_TABLE).update(updates).eq("id", exp_id).execute()
    logger.info("Updated experiment %s: %s", exp_id, list(updates.keys()))
    return get_experiment(exp_id)


def delete_experiment(exp_id: str) -> bool:
    if get_experiment(exp_id) is None:
        return False
    get_client().table(_EXP_TABLE).delete().eq("id", exp_id).execute()
    logger.info("Deleted experiment %s (DB cascade removes children)", exp_id)
    return True


def reorder_experiments(exp_ids: list[str]) -> None:
    """Update position for each experiment in the provided ordered list."""
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    for position, exp_id in enumerate(exp_ids):
        get_client().table(_EXP_TABLE).update(
            {"position": position, "updated_at": now}
        ).eq("id", exp_id).execute()
    logger.info("Reordered %d experiments", len(exp_ids))


# ---------------------------------------------------------------------------
# Experiment duplication
# ---------------------------------------------------------------------------

def _deep_clone_children(
    source_parent_id: str,
    new_parent_id: str,
    project_id: str,
    all_exps: list[Experiment],
) -> None:
    """Recursively clone all children of source_parent_id under new_parent_id."""
    children = sorted(
        [e for e in all_exps if e.parent_id == source_parent_id],
        key=lambda e: e.position,
    )
    for child in children:
        cloned = create_experiment(ExperimentCreate(
            project_id=project_id,
            parent_id=new_parent_id,
            rq_id=child.rq_id,
            name=child.name,
            status="planned",
            config=child.config,
            metrics={},
        ))
        _deep_clone_children(child.id, cloned.id, project_id, all_exps)


def duplicate_experiment(exp_id: str, deep: bool = False) -> Optional[Experiment]:
    """Clone an experiment (shallow or deep).

    Shallow: copies name + " (copy)", same config, empty metrics, status "planned".
    Deep: additionally recursively clones all child experiments (without the " (copy)" suffix).
    Returns the new root experiment, or None if the source does not exist.
    """
    source = get_experiment(exp_id)
    if source is None:
        return None

    new_exp = create_experiment(ExperimentCreate(
        project_id=source.project_id,
        parent_id=source.parent_id,
        rq_id=source.rq_id,
        name=source.name + " (copy)",
        status="planned",
        config=source.config,
        metrics={},
    ))
    logger.info("Duplicated experiment %s → %s (deep=%s)", exp_id, new_exp.id, deep)

    if deep:
        all_exps = list_experiments(source.project_id)
        _deep_clone_children(source.id, new_exp.id, source.project_id, all_exps)

    return new_exp


# ---------------------------------------------------------------------------
# Experiment-paper links
# ---------------------------------------------------------------------------

def list_experiment_papers(exp_id: str) -> list[ExperimentPaper]:
    result = (
        get_client()
        .table(_EP_TABLE)
        .select("*")
        .eq("experiment_id", exp_id)
        .order("created_at")
        .execute()
    )
    return [ExperimentPaper.model_validate(r) for r in result.data]


def link_experiment_paper(exp_id: str, data: ExperimentPaperCreate) -> ExperimentPaper:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    link = ExperimentPaper(
        id=f"ep_{uuid.uuid4().hex[:8]}",
        experiment_id=exp_id,
        paper_id=data.paper_id,
        website_id=data.website_id,
        github_repo_id=data.github_repo_id,
        created_at=now,
    )
    row = {k: v for k, v in link.model_dump(by_alias=False).items() if v is not None}
    get_client().table(_EP_TABLE).insert(row).execute()
    logger.info("Linked paper/website/repo to experiment %s (link %s)", exp_id, link.id)
    return link


def unlink_experiment_paper(link_id: str) -> bool:
    result = get_client().table(_EP_TABLE).select("id").eq("id", link_id).execute()
    if not result.data:
        return False
    get_client().table(_EP_TABLE).delete().eq("id", link_id).execute()
    logger.info("Unlinked experiment_paper %s", link_id)
    return True
