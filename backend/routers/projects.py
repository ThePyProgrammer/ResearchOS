import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.project import ProjectCreate, ProjectUpdate
from models.project_paper import ProjectPaperCreate
from services import project_papers_service, project_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])

NOT_FOUND = {"error": "not_found", "detail": "Project not found"}
NOT_FOUND_LINK = {"error": "not_found", "detail": "Link not found"}


@router.get("")
async def list_projects(library_id: Optional[str] = None):
    projects = project_service.list_projects(library_id=library_id)
    return JSONResponse([p.model_dump(by_alias=True) for p in projects])


@router.post("", status_code=201)
async def create_project(data: ProjectCreate):
    project = project_service.create_project(data)
    return JSONResponse(project.model_dump(by_alias=True), status_code=201)


@router.get("/{project_id}")
async def get_project(project_id: str):
    project = project_service.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(project.model_dump(by_alias=True))


@router.patch("/{project_id}")
async def update_project(project_id: str, data: ProjectUpdate):
    project = project_service.update_project(project_id, data)
    if project is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(project.model_dump(by_alias=True))


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str):
    deleted = project_service.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)


# ---------------------------------------------------------------------------
# Project-paper link endpoints
# ---------------------------------------------------------------------------

@router.get("/{project_id}/papers")
async def list_project_papers(project_id: str):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    links = project_papers_service.list_project_papers(project_id)
    return JSONResponse([lnk.model_dump(by_alias=True) for lnk in links])


@router.post("/{project_id}/papers", status_code=201)
async def link_paper_to_project(project_id: str, data: ProjectPaperCreate):
    if project_service.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    link = project_papers_service.link_paper_to_project(project_id, data)
    return JSONResponse(link.model_dump(by_alias=True), status_code=201)


@router.delete("/{project_id}/papers/{link_id}", status_code=204)
async def unlink_paper_from_project(project_id: str, link_id: str):
    deleted = project_papers_service.unlink_paper_from_project(link_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND_LINK)
