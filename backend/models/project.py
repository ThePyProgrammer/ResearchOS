from typing import Literal, Optional

from .base import CamelModel


class Project(CamelModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str = "active"
    library_id: str
    created_at: str
    updated_at: str


class ProjectCreate(CamelModel):
    name: str
    description: Optional[str] = None
    status: Literal["active", "paused", "completed", "archived"] = "active"
    library_id: str


class ProjectUpdate(CamelModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["active", "paused", "completed", "archived"]] = None
