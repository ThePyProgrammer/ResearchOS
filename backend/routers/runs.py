import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.run import RunCreate
from services import run_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/runs", tags=["runs"])

NOT_FOUND = {"error": "not_found", "detail": "Run not found"}


@router.get("")
async def list_runs():
    runs = run_service.list_runs()
    return JSONResponse([r.model_dump(by_alias=True) for r in runs])


@router.post("", status_code=201)
async def create_run(data: RunCreate):
    run = run_service.create_run(data)
    return JSONResponse(run.model_dump(by_alias=True), status_code=201)


@router.get("/{run_id}")
async def get_run(run_id: str):
    run = run_service.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(run.model_dump(by_alias=True))
