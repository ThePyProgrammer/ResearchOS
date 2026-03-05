from typing import Optional
from .base import CamelModel


class ActivityAction(CamelModel):
    label: str
    href: str


class ActivityItem(CamelModel):
    id: str
    type: str  # agent, human
    icon: str
    icon_color: str
    icon_bg: str
    title: str
    detail: Optional[str] = None
    badges: Optional[list[str]] = None
    time: str
    running: Optional[bool] = None
    progress: Optional[int] = None
    current_step: Optional[str] = None
    action: Optional[ActivityAction] = None
