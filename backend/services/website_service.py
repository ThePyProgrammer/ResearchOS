import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.website import Website, WebsiteCreate, WebsiteUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "websites"


def list_websites(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    library_id: Optional[str] = None,
) -> list[Website]:
    query = get_client().table(_TABLE).select("*")
    if library_id:
        query = query.eq("library_id", library_id)
    result = query.execute()
    websites = [Website.model_validate(w) for w in result.data]

    if collection_id == "inbox":
        websites = [w for w in websites if w.status == "inbox"]
    elif collection_id and collection_id != "all":
        websites = [w for w in websites if collection_id in w.collections]
    if status:
        websites = [w for w in websites if w.status == status]
    return websites


def get_website(website_id: str) -> Optional[Website]:
    result = get_client().table(_TABLE).select("*").eq("id", website_id).execute()
    if not result.data:
        return None
    return Website.model_validate(result.data[0])


def get_website_by_url(url: str) -> Optional[Website]:
    result = get_client().table(_TABLE).select("*").eq("url", url).execute()
    if not result.data:
        return None
    return Website.model_validate(result.data[0])


def create_website(data: WebsiteCreate) -> Website:
    now = datetime.now(timezone.utc).isoformat()
    website = Website(
        id=f"w_{uuid.uuid4().hex[:8]}",
        created_at=now,
        **data.model_dump(),
    )
    get_client().table(_TABLE).insert(website.model_dump(by_alias=False)).execute()
    logger.info("Created website %s: %s", website.id, website.title)
    return website


def update_website(website_id: str, data: WebsiteUpdate) -> Optional[Website]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_website(website_id)
    if get_website(website_id) is None:
        return None
    get_client().table(_TABLE).update(updates).eq("id", website_id).execute()
    logger.info("Updated website %s: %s", website_id, list(updates.keys()))
    return get_website(website_id)


def delete_website(website_id: str) -> bool:
    if get_website(website_id) is None:
        return False
    get_client().table(_TABLE).delete().eq("id", website_id).execute()
    logger.info("Deleted website %s", website_id)
    return True
