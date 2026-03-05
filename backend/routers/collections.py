import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.collection import CollectionCreate, CollectionUpdate
from services import collection_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/collections", tags=["collections"])

NOT_FOUND = {"error": "not_found", "detail": "Collection not found"}


@router.get("")
async def list_collections():
    collections = collection_service.list_collections()
    return JSONResponse([c.model_dump(by_alias=True) for c in collections])


@router.post("", status_code=201)
async def create_collection(data: CollectionCreate):
    col = collection_service.create_collection(data)
    return JSONResponse(col.model_dump(by_alias=True), status_code=201)


@router.get("/{collection_id}")
async def get_collection(collection_id: str):
    col = collection_service.get_collection(collection_id)
    if col is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(col.model_dump(by_alias=True))


@router.patch("/{collection_id}")
async def update_collection(collection_id: str, data: CollectionUpdate):
    col = collection_service.update_collection(collection_id, data)
    if col is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(col.model_dump(by_alias=True))


@router.delete("/{collection_id}", status_code=204)
async def delete_collection(collection_id: str):
    deleted = collection_service.delete_collection(collection_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
