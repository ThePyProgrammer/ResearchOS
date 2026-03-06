import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.website import WebsiteCreate, WebsiteUpdate
from services import website_service
from services import activity_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/websites", tags=["websites"])

NOT_FOUND = {"error": "not_found", "detail": "Website not found"}


@router.get("")
async def list_websites(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    library_id: Optional[str] = None,
):
    websites = website_service.list_websites(
        collection_id=collection_id,
        status=status,
        library_id=library_id,
    )
    return JSONResponse([w.model_dump(by_alias=True) for w in websites])


@router.post("", status_code=201)
async def create_website(data: WebsiteCreate):
    website = website_service.create_website(data)
    activity_service.log_activity(
        type="human",
        icon="link",
        icon_color="text-teal-600",
        icon_bg="bg-teal-50",
        title=f"Added \"{website.title}\"",
        detail=website.url,
        action_label="View",
        action_href=website.url,
        library_id=website.library_id,
    )
    return JSONResponse(website.model_dump(by_alias=True), status_code=201)


# ---------------------------------------------------------------------------
# Import: fetch URL metadata and add as website
# ---------------------------------------------------------------------------

class WebsiteImportRequest(BaseModel):
    url: str
    library_id: Optional[str] = None


@router.post("/import", status_code=201)
async def import_website(data: WebsiteImportRequest):
    """Fetch a URL's metadata (title, description, author, date) and add it as a website."""
    from services.import_service import resolve_url_as_website

    url = data.url.strip()
    if not url:
        raise HTTPException(status_code=422, detail="url must not be empty")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=422, detail="url must start with http:// or https://")

    # Deduplicate by URL
    existing = website_service.get_website_by_url(url)
    if existing:
        return JSONResponse(
            {**existing.model_dump(by_alias=True), "already_exists": True},
            status_code=200,
        )

    try:
        meta = await resolve_url_as_website(url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching website '%s'", url)
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch website metadata: {exc}",
        ) from exc

    website_create = WebsiteCreate(
        title=meta["title"],
        url=url,
        authors=meta.get("authors") or [],
        published_date=meta.get("published_date"),
        description=meta.get("description"),
        status="inbox",
        source="human",
        library_id=data.library_id,
    )
    website = website_service.create_website(website_create)
    logger.info("Imported website '%s' from '%s'", website.title, url)
    activity_service.log_activity(
        type="human",
        icon="link",
        icon_color="text-teal-600",
        icon_bg="bg-teal-50",
        title=f"Imported \"{website.title}\"",
        detail=url,
        action_label="View",
        action_href=url,
        library_id=website.library_id,
    )
    return JSONResponse(
        {**website.model_dump(by_alias=True), "already_exists": False},
        status_code=201,
    )


@router.get("/{website_id}")
async def get_website(website_id: str):
    website = website_service.get_website(website_id)
    if website is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(website.model_dump(by_alias=True))


@router.patch("/{website_id}")
async def update_website(website_id: str, data: WebsiteUpdate):
    website = website_service.update_website(website_id, data)
    if website is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(website.model_dump(by_alias=True))


@router.delete("/{website_id}", status_code=204)
async def delete_website(website_id: str):
    deleted = website_service.delete_website(website_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
