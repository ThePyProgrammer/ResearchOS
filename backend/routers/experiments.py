import logging
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.experiment import ExperimentCreate, ExperimentUpdate, ExperimentPaperCreate
from services import experiment_service, note_service, project_service
from models.note import NoteCreate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["experiments"])

NOT_FOUND = {"error": "not_found", "detail": "Experiment not found"}
NOT_FOUND_PROJECT = {"error": "not_found", "detail": "Project not found"}
LINK_NOT_FOUND = {"error": "not_found", "detail": "Link not found"}


class ReorderRequest(BaseModel):
    ids: List[str]


# ---------------------------------------------------------------------------
# Project-scoped experiment endpoints
# ---------------------------------------------------------------------------

@router.post("/api/projects/{project_id}/experiments", status_code=201)
async def create_experiment(project_id: str, data: ExperimentCreate):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    # Ensure project_id from path is authoritative
    canonical = ExperimentCreate(
        project_id=project_id,
        parent_id=data.parent_id,
        rq_id=data.rq_id,
        name=data.name,
        status=data.status,
        config=data.config,
        metrics=data.metrics,
    )
    exp = experiment_service.create_experiment(canonical)
    return JSONResponse(exp.model_dump(by_alias=True), status_code=201)


@router.get("/api/projects/{project_id}/experiments")
async def list_experiments(project_id: str):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    exps = experiment_service.list_experiments(project_id)
    return JSONResponse([e.model_dump(by_alias=True) for e in exps])


# ---------------------------------------------------------------------------
# Experiment-scoped endpoints
# ---------------------------------------------------------------------------

@router.patch("/api/experiments/{exp_id}")
async def update_experiment(exp_id: str, data: ExperimentUpdate):
    exp = experiment_service.update_experiment(exp_id, data)
    if exp is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(exp.model_dump(by_alias=True))


@router.delete("/api/experiments/{exp_id}", status_code=204)
async def delete_experiment(exp_id: str):
    deleted = experiment_service.delete_experiment(exp_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)


@router.post("/api/experiments/{exp_id}/reorder", status_code=204)
async def reorder_experiments(exp_id: str, body: ReorderRequest):
    """Reorder sibling experiments. exp_id is the reference; ordering comes from body.ids."""
    experiment_service.reorder_experiments(body.ids)


# ---------------------------------------------------------------------------
# Experiment-paper link endpoints
# ---------------------------------------------------------------------------

@router.get("/api/experiments/{exp_id}/papers")
async def list_experiment_papers(exp_id: str):
    if experiment_service.get_experiment(exp_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    links = experiment_service.list_experiment_papers(exp_id)
    return JSONResponse([lnk.model_dump(by_alias=True) for lnk in links])


@router.post("/api/experiments/{exp_id}/papers", status_code=201)
async def link_paper_to_experiment(exp_id: str, data: ExperimentPaperCreate):
    if experiment_service.get_experiment(exp_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    link = experiment_service.link_experiment_paper(exp_id, data)
    return JSONResponse(link.model_dump(by_alias=True), status_code=201)


@router.delete("/api/experiments/{exp_id}/papers/{link_id}", status_code=204)
async def unlink_paper_from_experiment(exp_id: str, link_id: str):
    deleted = experiment_service.unlink_experiment_paper(link_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=LINK_NOT_FOUND)


# ---------------------------------------------------------------------------
# Experiment note endpoints
# ---------------------------------------------------------------------------

@router.get("/api/experiments/{exp_id}/notes")
async def list_experiment_notes(exp_id: str):
    if experiment_service.get_experiment(exp_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    notes = note_service.list_notes(experiment_id=exp_id)
    return JSONResponse([n.model_dump(by_alias=True) for n in notes])


@router.post("/api/experiments/{exp_id}/notes", status_code=201)
async def create_experiment_note(exp_id: str, data: NoteCreate):
    if experiment_service.get_experiment(exp_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    note = note_service.create_note(data, experiment_id=exp_id)
    return JSONResponse(note.model_dump(by_alias=True), status_code=201)
