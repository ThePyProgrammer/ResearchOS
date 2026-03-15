from typing import Literal, Optional

from .base import CamelModel


class ResearchQuestion(CamelModel):
    id: str
    project_id: str
    parent_id: Optional[str] = None
    question: str
    hypothesis: Optional[str] = None
    status: str = "open"
    position: int = 0
    created_at: str
    updated_at: str


class ResearchQuestionCreate(CamelModel):
    project_id: str
    parent_id: Optional[str] = None
    question: str
    position: int = 0


class ResearchQuestionUpdate(CamelModel):
    question: Optional[str] = None
    hypothesis: Optional[str] = None
    status: Optional[Literal["open", "investigating", "answered", "discarded"]] = None
    parent_id: Optional[str] = None
    position: Optional[int] = None
