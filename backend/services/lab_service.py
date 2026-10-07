import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from postgrest.exceptions import APIError

from models.lab import (
    Lab, LabCreate, LabMember, LabMemberPage, LabPage,
    LabPaper, LabPaperPage, LabUpdate,
)
from services.db import get_client

logger = logging.getLogger(__name__)


def _contains(value: str) -> str:
    return "%" + value.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def list_labs(search: str = "", limit: int = 30, offset: int = 0) -> LabPage:
    query = get_client().table("labs").select("*", count="exact")
    if search.strip():
        query = query.ilike("name", _contains(search))
    result = query.order("name").order("id").range(offset, offset + limit - 1).execute()
    return LabPage(items=[Lab.model_validate(row) for row in result.data],
                   total=result.count, limit=limit, offset=offset)


def get_lab(lab_id: str) -> Optional[Lab]:
    result = get_client().table("labs").select("*").eq("id", lab_id).execute()
    return Lab.model_validate(result.data[0]) if result.data else None


def create_lab(data: LabCreate) -> Lab:
    lab = Lab(id=f"lab_{uuid.uuid4().hex}", created_at=datetime.now(timezone.utc).isoformat(),
              **data.model_dump())
    get_client().table("labs").insert(lab.model_dump()).execute()
    logger.info("Created lab %s", lab.id)
    return lab


def update_lab(lab_id: str, data: LabUpdate) -> Optional[Lab]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_lab(lab_id)
    result = get_client().table("labs").update(updates).eq("id", lab_id).execute()
    if not result.data:
        return None
    logger.info("Updated lab %s", lab_id)
    return Lab.model_validate(result.data[0])


def delete_lab(lab_id: str) -> bool:
    result = get_client().table("labs").delete().eq("id", lab_id).execute()
    if not result.data:
        return False
    logger.info("Deleted lab %s", lab_id)
    return True


def list_members(lab_id: str, limit: int = 50, offset: int = 0) -> Optional[LabMemberPage]:
    try:
        result = get_client().rpc("get_lab_members_page", {
            "p_lab_id": lab_id, "p_limit": limit, "p_offset": offset,
        }).execute()
    except APIError as exc:
        if exc.code != "PGRST202":
            raise
        logger.warning(
            "get_lab_members_page unavailable in PostgREST; using paginated view. "
            "Apply 025_lab_page_functions.sql to restore the single-call RPC."
        )
        result = (get_client().table("lab_member_details")
                  .select("author_id,name,orcid", count="exact").eq("lab_id", lab_id)
                  .order("name").order("author_id").range(offset, offset + limit - 1).execute())
        # A positive count proves the lab exists, even for a page past the end.
        # Only an empty view needs an existence check to distinguish empty/404.
        if result.count == 0 and get_lab(lab_id) is None:
            return None
        return LabMemberPage(items=[LabMember.model_validate(row) for row in result.data],
                             total=result.count, limit=limit, offset=offset)
    return LabMemberPage.model_validate(result.data) if result.data is not None else None


def member_options(lab_id: str, search: str, limit: int = 20) -> Optional[list[LabMember]]:
    if get_lab(lab_id) is None:
        return None
    result = get_client().rpc("search_lab_member_options", {
        "p_lab_id": lab_id, "p_search": search, "p_limit": limit,
    }).execute()
    return [LabMember.model_validate(row) for row in result.data]


def add_member(lab_id: str, author_id: str) -> Optional[LabMember]:
    if get_lab(lab_id) is None:
        return None
    result = get_client().table("authors").select("id,name,orcid").eq("id", author_id).execute()
    if not result.data:
        raise HTTPException(404, detail={"error": "not_found", "detail": "Author not found"})
    author = result.data[0]
    try:
        get_client().table("lab_members").upsert(
            {"lab_id": lab_id, "author_id": author_id},
            on_conflict="lab_id,author_id", ignore_duplicates=True,
        ).execute()
    except APIError as exc:
        if exc.code != "23503":
            raise
        # A lab/author can be deleted between validation and insertion.
        logger.warning("Membership target disappeared: lab=%s author=%s", lab_id, author_id)
        raise HTTPException(404, detail={"error": "not_found", "detail": "Lab or author not found"}) from exc
    logger.info("Added author %s to lab %s", author_id, lab_id)
    return LabMember(author_id=author["id"], name=author["name"], orcid=author.get("orcid"))


def remove_member(lab_id: str, author_id: str) -> bool:
    if get_lab(lab_id) is None:
        return False
    get_client().table("lab_members").delete().eq("lab_id", lab_id).eq("author_id", author_id).execute()
    logger.info("Removed author %s from lab %s", author_id, lab_id)
    return True


def list_papers(lab_id: str, search: str = "", limit: int = 25, offset: int = 0) -> Optional[LabPaperPage]:
    try:
        result = get_client().rpc("get_lab_papers_page", {
            "p_lab_id": lab_id, "p_search": search.strip(), "p_limit": limit, "p_offset": offset,
        }).execute()
    except APIError as exc:
        if exc.code != "PGRST202":
            raise
        logger.warning(
            "get_lab_papers_page unavailable in PostgREST; using paginated view. "
            "Apply 025_lab_page_functions.sql to restore the single-call RPC."
        )
        query = (get_client().table("lab_papers")
                 .select("id,title,authors,year,venue,status,library_id,library_name", count="exact")
                 .eq("lab_id", lab_id))
        if search.strip():
            query = query.ilike("title", _contains(search))
        result = query.order("year", desc=True).order("id").range(offset, offset + limit - 1).execute()
        if result.count == 0 and get_lab(lab_id) is None:
            return None
        return LabPaperPage(items=[LabPaper.model_validate(row) for row in result.data],
                            total=result.count, limit=limit, offset=offset)
    return LabPaperPage.model_validate(result.data) if result.data is not None else None
