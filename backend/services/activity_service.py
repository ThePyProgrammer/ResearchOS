import logging
from typing import Optional

from models.activity import ActivityItem
from services.storage import load_json

logger = logging.getLogger(__name__)

_FILE = "activity.json"


def _load() -> list[ActivityItem]:
    raw = load_json(_FILE)
    return [ActivityItem.model_validate(a) for a in raw]


def list_activity(type_filter: Optional[str] = None) -> list[ActivityItem]:
    items = _load()
    if type_filter:
        items = [a for a in items if a.type == type_filter]
    return items
