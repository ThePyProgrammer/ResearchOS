from typing import Optional

from .base import CamelModel


class ProjectPaper(CamelModel):
    id: str
    project_id: str
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    created_at: str


class ProjectPaperCreate(CamelModel):
    paper_id: Optional[str] = None
    website_id: Optional[str] = None


class RqPaper(CamelModel):
    id: str
    rq_id: str
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    created_at: str


class RqPaperCreate(CamelModel):
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
