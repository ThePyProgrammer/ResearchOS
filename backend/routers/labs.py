from typing import Annotated, Optional

from fastapi import APIRouter, HTTPException, Path, Query

from models.lab import LabCreate, LabDetail, LabMember, LabMemberPage, LabPage, LabPaperAddResult, LabPaperPage, LabPaperSelection, LabUpdate
from services import lab_service

router = APIRouter(prefix="/api/labs", tags=["labs"])
NOT_FOUND = {"error": "not_found", "detail": "Lab not found"}
LabId = Annotated[str, Path(min_length=1, max_length=100)]
AuthorId = Annotated[str, Path(min_length=1, max_length=100)]
PaperId = Annotated[str, Path(min_length=1, max_length=100)]


@router.get("", response_model=LabPage)
def list_labs(search: str = Query("", max_length=200), limit: int = Query(30, ge=1, le=100),
              offset: int = Query(0, ge=0)):
    return lab_service.list_labs(search=search, limit=limit, offset=offset)


@router.get("/pi-options", response_model=list[LabMember])
def pi_options(search: str = Query(..., min_length=2, max_length=200),
               limit: int = Query(20, ge=1, le=50)):
    return lab_service.pi_options(search=search, limit=limit)


@router.post("", response_model=LabDetail, status_code=201)
def create_lab(data: LabCreate):
    return lab_service.create_lab(data)


@router.get("/{lab_id}", response_model=LabDetail)
def get_lab(lab_id: LabId):
    lab = lab_service.get_lab(lab_id)
    if lab is None:
        raise HTTPException(404, detail=NOT_FOUND)
    return lab


@router.patch("/{lab_id}", response_model=LabDetail)
def update_lab(lab_id: LabId, data: LabUpdate):
    lab = lab_service.update_lab(lab_id, data)
    if lab is None:
        raise HTTPException(404, detail=NOT_FOUND)
    return lab


@router.delete("/{lab_id}", status_code=204)
def delete_lab(lab_id: LabId):
    if not lab_service.delete_lab(lab_id):
        raise HTTPException(404, detail=NOT_FOUND)


@router.get("/{lab_id}/members", response_model=LabMemberPage)
def list_members(lab_id: LabId, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                 exclude_pis: bool = Query(False, alias="excludePis")):
    result = lab_service.list_members(lab_id, limit=limit, offset=offset, exclude_pis=exclude_pis)
    if result is None:
        raise HTTPException(404, detail=NOT_FOUND)
    return result


@router.get("/{lab_id}/member-options", response_model=list[LabMember])
def member_options(lab_id: LabId, search: str = Query(..., min_length=1, max_length=200),
                   limit: int = Query(20, ge=1, le=50)):
    result = lab_service.member_options(lab_id, search=search, limit=limit)
    if result is None:
        raise HTTPException(404, detail=NOT_FOUND)
    return result


@router.put("/{lab_id}/members/{author_id}", response_model=LabMember)
def add_member(lab_id: LabId, author_id: AuthorId):
    result = lab_service.add_member(lab_id, author_id)
    if result is None:
        raise HTTPException(404, detail=NOT_FOUND)
    return result


@router.delete("/{lab_id}/members/{author_id}", status_code=204)
def remove_member(lab_id: LabId, author_id: AuthorId):
    if not lab_service.remove_member(lab_id, author_id):
        raise HTTPException(404, detail=NOT_FOUND)


@router.get("/{lab_id}/papers", response_model=LabPaperPage)
def list_papers(lab_id: LabId, search: str = Query("", max_length=200),
                limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0)):
    result = lab_service.list_papers(lab_id, search=search, limit=limit, offset=offset)
    if result is None:
        raise HTTPException(404, detail=NOT_FOUND)
    return result


@router.get("/{lab_id}/paper-options", response_model=LabPaperPage)
def paper_options(lab_id: LabId, search: str = Query("", max_length=200),
                  author_id: Optional[str] = Query(None, min_length=1, max_length=100),
                  limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0)):
    result = lab_service.paper_options(lab_id, search=search, author_id=author_id, limit=limit, offset=offset)
    if result is None:
        raise HTTPException(404, detail=NOT_FOUND)
    return result


@router.post("/{lab_id}/papers", response_model=LabPaperAddResult)
def add_papers(lab_id: LabId, data: LabPaperSelection):
    result = lab_service.add_papers(lab_id, data)
    if result is None:
        raise HTTPException(404, detail=NOT_FOUND)
    return result


@router.delete("/{lab_id}/papers/{paper_id}", status_code=204)
def remove_paper(lab_id: LabId, paper_id: PaperId):
    if not lab_service.remove_paper(lab_id, paper_id):
        raise HTTPException(404, detail=NOT_FOUND)
