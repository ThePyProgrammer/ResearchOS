import logging
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from services import activity_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("")
async def list_activity(type: Optional[str] = None, library_id: Optional[str] = None):
    items = activity_service.list_activity(type_filter=type, library_id=library_id)
    return JSONResponse([a.model_dump(by_alias=True) for a in items])
