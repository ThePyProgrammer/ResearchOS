import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from models.collection import CollectionCreate, CollectionUpdate
from services import collection_service
from services import activity_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/collections", tags=["collections"])

NOT_FOUND = {"error": "not_found", "detail": "Collection not found"}


@router.get("")
async def list_collections(library_id: Optional[str] = None):
    collections = collection_service.list_collections(library_id=library_id)
    return JSONResponse([c.model_dump(by_alias=True) for c in collections])


@router.post("", status_code=201)
async def create_collection(data: CollectionCreate):
    col = collection_service.create_collection(data)
    activity_service.log_activity(
        type="human",
        icon="create_new_folder",
        icon_color="text-violet-600",
        icon_bg="bg-violet-50",
        title=f"Created collection \"{col.name}\"",
        detail=f"Subcollection of parent" if col.parent_id else None,
        action_label="Open library",
        action_href=f"/library?col={col.id}",
        library_id=col.library_id,
    )
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


@router.get("/{collection_id}/top-authors")
async def get_top_authors(
    collection_id: str,
    limit: int = 10,
):
    col = collection_service.get_collection(collection_id)
    if col is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    from services import paper_service, website_service, author_service

    papers = paper_service.list_papers(collection_id=collection_id)
    websites = website_service.list_websites(collection_id=collection_id)
    paper_ids = [p.id for p in papers] + [w.id for w in websites]

    if not paper_ids:
        return JSONResponse([])

    top = author_service.get_top_authors_for_papers(paper_ids, limit=limit)
    return JSONResponse(top)
