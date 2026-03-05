import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from services import workflow_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/workflows", tags=["workflows"])

NOT_FOUND = {"error": "not_found", "detail": "Workflow not found"}


@router.get("")
async def list_workflows():
    workflows = workflow_service.list_workflows()
    return JSONResponse([w.model_dump(by_alias=True) for w in workflows])


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str):
    workflow = workflow_service.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(workflow.model_dump(by_alias=True))
