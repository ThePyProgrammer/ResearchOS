import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from postgrest.exceptions import APIError

from models.lab import (
    Lab, LabCreate, LabMember, LabMemberPage, LabPage,
    LabPaper, LabPaperAddResult, LabPaperPage, LabPaperSelection, LabUpdate,
)
from services.db import get_client

logger = logging.getLogger(__name__)


def _explicit_migration_required() -> None:
    logger.warning("Explicit Labs schema unavailable; apply 026_explicit_lab_papers.sql")
    raise HTTPException(503, detail="Labs needs migration 026_explicit_lab_papers.sql. Apply it in Supabase and retry.")


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
    try:
        result = get_client().rpc("add_lab_member_only", {
            "p_lab_id": lab_id, "p_author_id": author_id,
        }).execute()
    except APIError as exc:
        if exc.code == "PGRST202":
            _explicit_migration_required()
        if exc.code == "P0002":
            raise HTTPException(404, detail={"error": "not_found", "detail": "Author not found"}) from exc
        raise
    if result.data is None:
        return None
    logger.info("Added author %s to lab %s", author_id, lab_id)
    return LabMember.model_validate(result.data)


def remove_member(lab_id: str, author_id: str) -> bool:
    try:
        result = get_client().rpc("remove_lab_member_only", {
            "p_lab_id": lab_id, "p_author_id": author_id,
        }).execute()
    except APIError as exc:
        if exc.code == "PGRST202":
            _explicit_migration_required()
        raise
    if not result.data:
        return False
    logger.info("Removed author %s from lab %s", author_id, lab_id)
    return True


def list_papers(lab_id: str, search: str = "", limit: int = 25, offset: int = 0) -> Optional[LabPaperPage]:
    try:
        result = get_client().rpc("get_lab_selected_papers_page", {
            "p_lab_id": lab_id, "p_search": search.strip(), "p_limit": limit, "p_offset": offset,
        }).execute()
    except APIError as exc:
        if exc.code != "PGRST202":
            raise
        logger.warning(
            "get_lab_selected_papers_page unavailable in PostgREST; using explicit paper view. "
            "Apply 026_explicit_lab_papers.sql to restore the single-call RPC."
        )
        query = (get_client().table("lab_selected_papers")
                 .select("id,title,authors,year,venue,status,library_id,library_name", count="exact")
                 .eq("lab_id", lab_id))
        if search.strip():
            query = query.ilike("title", _contains(search))
        try:
            result = query.order("year", desc=True).order("id").range(offset, offset + limit - 1).execute()
        except APIError as view_exc:
            if view_exc.code in ("PGRST205", "42P01"):
                _explicit_migration_required()
            raise
        if result.count == 0 and get_lab(lab_id) is None:
            return None
        return LabPaperPage(items=[LabPaper.model_validate(row) for row in result.data],
                            total=result.count, limit=limit, offset=offset)
    return LabPaperPage.model_validate(result.data) if result.data is not None else None


def paper_options(lab_id: str, search: str = "", author_id: Optional[str] = None,
                  limit: int = 25, offset: int = 0) -> Optional[LabPaperPage]:
    try:
        result = get_client().rpc("get_lab_paper_options", {
            "p_lab_id": lab_id, "p_search": search.strip(), "p_author_id": author_id,
            "p_limit": limit, "p_offset": offset,
        }).execute()
    except APIError as exc:
        if exc.code == "PGRST202":
            _explicit_migration_required()
        raise
    return LabPaperPage.model_validate(result.data) if result.data is not None else None


def add_papers(lab_id: str, data: LabPaperSelection) -> Optional[LabPaperAddResult]:
    try:
        result = get_client().rpc("add_lab_papers", {
            "p_lab_id": lab_id, "p_paper_ids": list(dict.fromkeys(data.paper_ids)),
            "p_author_id": data.author_id,
        }).execute()
    except APIError as exc:
        if exc.code == "PGRST202":
            _explicit_migration_required()
        if exc.code == "P0002":
            raise HTTPException(404, detail={"error": "not_found", "detail": "One or more selected papers no longer exist."}) from exc
        if exc.code == "22023":
            raise HTTPException(422, detail="Select up to 100 papers linked to the chosen author, or use Add papers directly.") from exc
        raise
    if result.data is None:
        return None
    added = LabPaperAddResult.model_validate(result.data)
    logger.info("Added %s explicit paper links to lab %s", added.added_count, lab_id)
    return added


def remove_paper(lab_id: str, paper_id: str) -> bool:
    if get_lab(lab_id) is None:
        return False
    try:
        get_client().table("lab_paper_links").delete().eq("lab_id", lab_id).eq("paper_id", paper_id).execute()
    except APIError as exc:
        if exc.code in ("PGRST205", "42P01"):
            _explicit_migration_required()
        raise
    logger.info("Removed paper %s from lab %s", paper_id, lab_id)
    return True
