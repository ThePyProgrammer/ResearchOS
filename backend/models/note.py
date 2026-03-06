from typing import Optional
from .base import CamelModel


class Note(CamelModel):
    id: str
    paper_id: str
    name: str
    parent_id: Optional[str] = None
    type: str = "file"  # file | folder
    content: str = ""
    created_at: str
    updated_at: str


class NoteCreate(CamelModel):
    name: str
    parent_id: Optional[str] = None
    type: str = "file"
    content: str = ""


class NoteUpdate(CamelModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    content: Optional[str] = None
