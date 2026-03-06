import logging
from typing import Optional

from models.activity import ActivityItem
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "activity"


def list_activity(type_filter: Optional[str] = None) -> list[ActivityItem]:
    query = get_client().table(_TABLE).select("*")
    if type_filter:
        query = query.eq("type", type_filter)
    result = query.execute()
    return [ActivityItem.model_validate(a) for a in result.data]
