import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from postgrest.exceptions import APIError

from models.lab import (
    Lab, LabCreate, LabDetail, LabMember, LabMemberPage, LabPage,
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
    query = get_client().table("lab_details").select("*", count="exact")
    if search.strip():
        query = query.ilike("name", _contains(search))
    try:
        result = query.order("name").order("id").range(offset, offset + limit - 1).execute()
    except APIError as exc:
        if exc.code in ("PGRST205", "42P01"):
            _details_migration_required()
        raise
    return LabPage(items=[LabDetail.model_validate(row) for row in result.data],
                   total=result.count, limit=limit, offset=offset)


def _details_migration_required() -> None:
    logger.warning("Lab details schema unavailable; apply 027_lab_details.sql")
    raise HTTPException(503, detail="Labs needs migration 027_lab_details.sql. Apply it in Supabase and retry.")


def get_lab(lab_id: str) -> Optional[LabDetail]:
    try:
        result = get_client().table("lab_details").select("*").eq("id", lab_id).execute()
    except APIError as exc:
        if exc.code in ("PGRST205", "42P01"):
            _details_migration_required()
        raise
    return LabDetail.model_validate(result.data[0]) if result.data else None


def _save_lab(lab_id: str, data: LabUpdate, created_at: Optional[str] = None) -> Optional[LabDetail]:
    try:
        result = get_client().rpc("save_lab_details", {
            "p_lab_id": lab_id, "p_data": data.model_dump(exclude_unset=True),
            "p_created_at": created_at,
        }).execute()
    except APIError as exc:
        if exc.code == "PGRST202":
            _details_migration_required()
        if exc.code in ("P0002", "23503"):
            raise HTTPException(404, detail={"error": "not_found", "detail": "One or more selected PIs no longer exist."}) from exc
        if exc.code == "22023":
            raise HTTPException(422, detail="Select up to 50 PIs and add up to 20 valid HTTP/HTTPS website URLs.") from exc
        raise
    logger.info("Saved lab details %s", lab_id)
    return LabDetail.model_validate(result.data) if result.data is not None else None


def create_lab(data: LabCreate) -> LabDetail:
    return _save_lab(f"lab_{uuid.uuid4().hex}", LabUpdate.model_validate(data.model_dump()),
                     datetime.now(timezone.utc).isoformat())


def update_lab(lab_id: str, data: LabUpdate) -> Optional[LabDetail]:
    return _save_lab(lab_id, data) if data.model_fields_set else get_lab(lab_id)


def pi_options(search: str, limit: int = 20) -> list[LabMember]:
    result = (get_client().table("authors").select("author_id:id,name,orcid")
              .ilike("name", _contains(search)).order("name").order("id")
              .range(0, limit - 1).execute())
    return [LabMember.model_validate(row) for row in result.data]


def delete_lab(lab_id: str) -> bool:
    result = get_client().table("labs").delete().eq("id", lab_id).execute()
    if not result.data:
        return False
    logger.info("Deleted lab %s", lab_id)
    return True


def list_members(lab_id: str, limit: int = 50, offset: int = 0,
                 exclude_pis: bool = False) -> Optional[LabMemberPage]:
    if exclude_pis:
        # Filter before counting/pagination; PI and membership records stay independent.
        # Two bounded queries avoid fetching every member or issuing per-author requests.
        lab = get_lab(lab_id)
        if lab is None:
            return None
        query = (get_client().table("lab_member_details")
                 .select("author_id,name,orcid", count="exact").eq("lab_id", lab_id))
        pi_ids = [pi.author_id for pi in lab.principal_investigators]
        if pi_ids:
            query = query.not_.in_("author_id", pi_ids)
        result = query.order("name").order("author_id").range(offset, offset + limit - 1).execute()
        return LabMemberPage(items=[LabMember.model_validate(row) for row in result.data],
                             total=result.count, limit=limit, offset=offset)
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
