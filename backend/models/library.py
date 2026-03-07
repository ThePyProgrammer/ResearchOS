from typing import Optional
from .base import CamelModel


class Library(CamelModel):
    id: str
    name: str
    description: Optional[str] = None
    auto_note_enabled: bool = False
    auto_note_prompt: Optional[str] = None
    created_at: str


class LibraryCreate(CamelModel):
    name: str
    description: Optional[str] = None


class LibraryUpdate(CamelModel):
    name: Optional[str] = None
    description: Optional[str] = None
    auto_note_enabled: Optional[bool] = None
    auto_note_prompt: Optional[str] = None
