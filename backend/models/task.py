from typing import Any, Literal, Optional

from .base import CamelModel


# ---------------------------------------------------------------------------
# TaskColumn models
# ---------------------------------------------------------------------------

class TaskColumn(CamelModel):
    id: str
    project_id: str
    name: str
    color: str = '#94a3b8'
    position: int = 0
    created_at: str


class TaskColumnCreate(CamelModel):
    name: str
    color: Optional[str] = '#94a3b8'


class TaskColumnUpdate(CamelModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None


# ---------------------------------------------------------------------------
# Task models
# ---------------------------------------------------------------------------

class Task(CamelModel):
    id: str
    project_id: str
    column_id: str
    title: str
    description: Optional[str] = None
    priority: Literal['high', 'medium', 'low', 'none'] = 'none'
    due_date: Optional[str] = None
    tags: list[str] = []
    custom_fields: dict[str, Any] = {}
    position: int = 0
    created_at: str
    updated_at: str


class TaskCreate(CamelModel):
    column_id: str
    title: str
    description: Optional[str] = None
    priority: Literal['high', 'medium', 'low', 'none'] = 'none'
    due_date: Optional[str] = None
    tags: list[str] = []
    custom_fields: dict[str, Any] = {}


class TaskUpdate(CamelModel):
    column_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Literal['high', 'medium', 'low', 'none']] = None
    due_date: Optional[str] = None
    tags: Optional[list[str]] = None
    custom_fields: Optional[dict[str, Any]] = None
    position: Optional[int] = None


# ---------------------------------------------------------------------------
# TaskFieldDef models
# ---------------------------------------------------------------------------

class TaskFieldDef(CamelModel):
    id: str
    project_id: str
    name: str
    field_type: Literal['text', 'number', 'date', 'select', 'multi_select']
    options: list[str] = []
    position: int = 0
    created_at: str


class TaskFieldDefCreate(CamelModel):
    name: str
    field_type: Literal['text', 'number', 'date', 'select', 'multi_select']
    options: list[str] = []


class TaskFieldDefUpdate(CamelModel):
    name: Optional[str] = None
    field_type: Optional[Literal['text', 'number', 'date', 'select', 'multi_select']] = None
    options: Optional[list[str]] = None
    position: Optional[int] = None
