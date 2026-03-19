import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from models.task import (
    TaskCreate,
    TaskUpdate,
    TaskColumnCreate,
    TaskColumnUpdate,
    TaskFieldDefCreate,
    TaskFieldDefUpdate,
)
from services import task_service, project_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tasks"])

NOT_FOUND_PROJECT = {"error": "not_found", "detail": "Project not found"}
NOT_FOUND_TASK = {"error": "not_found", "detail": "Task not found"}
NOT_FOUND_COLUMN = {"error": "not_found", "detail": "Task column not found"}
NOT_FOUND_FIELD_DEF = {"error": "not_found", "detail": "Task field definition not found"}


# ---------------------------------------------------------------------------
# Project-scoped task endpoints
# ---------------------------------------------------------------------------

@router.get("/api/projects/{project_id}/tasks")
async def list_tasks(project_id: str):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    tasks = task_service.list_tasks(project_id)
    return JSONResponse([t.model_dump(by_alias=True) for t in tasks])


@router.post("/api/projects/{project_id}/tasks", status_code=201)
async def create_task(project_id: str, data: TaskCreate):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    task = task_service.create_task(project_id, data)
    return JSONResponse(task.model_dump(by_alias=True), status_code=201)


# ---------------------------------------------------------------------------
# Task-scoped endpoints
# ---------------------------------------------------------------------------

@router.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, data: TaskUpdate):
    task = task_service.update_task(task_id, data)
    if task is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_TASK)
    return JSONResponse(task.model_dump(by_alias=True))


@router.delete("/api/tasks/{task_id}", status_code=204)
async def delete_task(task_id: str):
    deleted = task_service.delete_task(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND_TASK)


# ---------------------------------------------------------------------------
# Project-scoped task column endpoints
# ---------------------------------------------------------------------------

@router.get("/api/projects/{project_id}/task-columns")
async def list_task_columns(project_id: str):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    columns = task_service.list_or_seed_task_columns(project_id)
    return JSONResponse([c.model_dump(by_alias=True) for c in columns])


@router.post("/api/projects/{project_id}/task-columns", status_code=201)
async def create_task_column(project_id: str, data: TaskColumnCreate):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    col = task_service.create_task_column(project_id, data)
    return JSONResponse(col.model_dump(by_alias=True), status_code=201)


# ---------------------------------------------------------------------------
# Column-scoped endpoints
# ---------------------------------------------------------------------------

@router.patch("/api/task-columns/{column_id}")
async def update_task_column(column_id: str, data: TaskColumnUpdate):
    col = task_service.update_task_column(column_id, data)
    if col is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_COLUMN)
    return JSONResponse(col.model_dump(by_alias=True))


@router.delete("/api/task-columns/{column_id}", status_code=204)
async def delete_task_column(
    column_id: str,
    move_to: str = Query(..., description="Column ID to move tasks to before deleting"),
):
    col = task_service.get_task_column(column_id)
    if col is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_COLUMN)
    target = task_service.get_task_column(move_to)
    if target is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "detail": "Target column not found"})
    deleted = task_service.delete_task_column(column_id, move_to)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND_COLUMN)


# ---------------------------------------------------------------------------
# Project-scoped task field def endpoints
# ---------------------------------------------------------------------------

@router.get("/api/projects/{project_id}/task-field-defs")
async def list_task_field_defs(project_id: str):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    defs = task_service.list_task_field_defs(project_id)
    return JSONResponse([d.model_dump(by_alias=True) for d in defs])


@router.post("/api/projects/{project_id}/task-field-defs", status_code=201)
async def create_task_field_def(project_id: str, data: TaskFieldDefCreate):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_PROJECT)
    fd = task_service.create_task_field_def(project_id, data)
    return JSONResponse(fd.model_dump(by_alias=True), status_code=201)


# ---------------------------------------------------------------------------
# Field-def-scoped endpoints
# ---------------------------------------------------------------------------

@router.patch("/api/task-field-defs/{def_id}")
async def update_task_field_def(def_id: str, data: TaskFieldDefUpdate):
    fd = task_service.update_task_field_def(def_id, data)
    if fd is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_FIELD_DEF)
    return JSONResponse(fd.model_dump(by_alias=True))


@router.delete("/api/task-field-defs/{def_id}", status_code=204)
async def delete_task_field_def(def_id: str):
    deleted = task_service.delete_task_field_def(def_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND_FIELD_DEF)
