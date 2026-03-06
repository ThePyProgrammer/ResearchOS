import os
import logging
from functools import lru_cache

from supabase import create_client, Client

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in environment")
    logger.info("Connecting to Supabase at %s", url)
    return create_client(url, key)


