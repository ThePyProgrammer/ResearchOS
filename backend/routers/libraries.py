import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.library import LibraryCreate, LibraryUpdate
from services import library_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/libraries", tags=["libraries"])


@router.get("")
async def list_libraries():
    libs = library_service.list_libraries()
    return JSONResponse([l.model_dump(by_alias=True) for l in libs])


@router.post("", status_code=201)
async def create_library(data: LibraryCreate):
    lib = library_service.create_library(data)
    return JSONResponse(lib.model_dump(by_alias=True), status_code=201)


@router.patch("/{library_id}")
async def update_library(library_id: str, data: LibraryUpdate):
    lib = library_service.update_library(library_id, data)
    if lib is None:
        raise HTTPException(status_code=404, detail="Library not found")
    return JSONResponse(lib.model_dump(by_alias=True))


@router.delete("/{library_id}", status_code=204)
async def delete_library(library_id: str):
    deleted = library_service.delete_library(library_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Library not found")
