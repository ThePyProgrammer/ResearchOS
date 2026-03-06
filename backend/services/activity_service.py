import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.activity import ActivityItem, ActivityAction
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "activity"


def list_activity(type_filter: Optional[str] = None) -> list[ActivityItem]:
    query = get_client().table(_TABLE).select("*")
    if type_filter:
        query = query.eq("type", type_filter)
    result = query.execute()
    # Reverse so the most recently inserted rows appear first
    return [ActivityItem.model_validate(a) for a in reversed(result.data)]


def log_activity(
    *,
    type: str,
    icon: str,
    icon_color: str,
    icon_bg: str,
    title: str,
    detail: Optional[str] = None,
    badges: Optional[list[str]] = None,
    action_label: Optional[str] = None,
    action_href: Optional[str] = None,
) -> ActivityItem:
    """Create a new activity entry and persist it to the database."""
    now = datetime.now(timezone.utc)
    # Format as "Jun 5, 14:32" — used for display since time is a plain string field
    day = str(now.day)
    time_str = now.strftime(f"%b {day}, %H:%M")

    action = ActivityAction(label=action_label, href=action_href) if action_label and action_href else None

    item = ActivityItem(
        id=f"act_{uuid.uuid4().hex[:8]}",
        type=type,
        icon=icon,
        icon_color=icon_color,
        icon_bg=icon_bg,
        title=title,
        detail=detail,
        badges=badges,
        time=time_str,
        action=action,
    )
    row = item.model_dump(by_alias=False)
    # Serialize nested action dict for JSONB
    if row.get("action") is not None:
        row["action"] = item.action.model_dump(by_alias=False)
    get_client().table(_TABLE).insert(row).execute()
    logger.info("Logged activity: %s", title)
    return item
