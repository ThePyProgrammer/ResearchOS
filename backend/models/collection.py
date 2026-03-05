from typing import Optional
from .base import CamelModel


class Collection(CamelModel):
    id: str
    name: str
    parent_id: Optional[str] = None
    type: str = "folder"  # folder, agent-output
    paper_count: int = 0


class CollectionCreate(CamelModel):
    name: str
    parent_id: Optional[str] = None
    type: str = "folder"


class CollectionUpdate(CamelModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
