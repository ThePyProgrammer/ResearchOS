import logging
from typing import Callable, Coroutine, Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse

from models.run import RunCreate
from services import run_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/runs", tags=["runs"])

NOT_FOUND = {"error": "not_found", "detail": "Run not found"}


# ---------------------------------------------------------------------------
# Workflow dispatcher
# ---------------------------------------------------------------------------

WorkflowFn = Callable[..., Coroutine[Any, Any, None]]

def _get_workflow_fn(workflow_id: str) -> Optional[WorkflowFn]:
    """Return the async workflow runner for a given workflow ID, or None."""
    # Import here to avoid circular imports at module load time
    if workflow_id == "wf1":
        from agents.literature_reviewer import run_literature_reviewer
        return run_literature_reviewer
    if workflow_id == "wf2":
        from agents.model_researcher import run_model_researcher
        return run_model_researcher
    if workflow_id == "wf3":
        from agents.experiment_designer import run_experiment_designer
        return run_experiment_designer
    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_runs():
    runs = run_service.list_runs()
    return JSONResponse([r.model_dump(by_alias=True) for r in runs])


@router.post("", status_code=201)
async def create_run(data: RunCreate, background_tasks: BackgroundTasks):
    """
    Start a new workflow run.

    Creates the run record immediately (status=running) and dispatches
    the corresponding agent workflow as a background task.
    """
    run = run_service.create_run(data)

    workflow_fn = _get_workflow_fn(data.workflow_id)
    if workflow_fn is not None:
        # Resolve target_collection_id from name if provided
        target_collection_id: Optional[str] = None
        if data.target_collection:
            from services.collection_service import list_collections
            cols = list_collections()
            match = next(
                (c for c in cols if c.name == data.target_collection), None
            )
            target_collection_id = match.id if match else None

        background_tasks.add_task(
            workflow_fn,
            run.id,
            data.prompt or "",
            target_collection_id,
        )
        logger.info(
            "Dispatched workflow %s as background task for run %s",
            data.workflow_id,
            run.id,
        )
    else:
        logger.warning(
            "No workflow implementation found for workflow_id=%s", data.workflow_id
        )

    return JSONResponse(run.model_dump(by_alias=True), status_code=201)


@router.get("/{run_id}")
async def get_run(run_id: str):
    run = run_service.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(run.model_dump(by_alias=True))
