"""
Usage statistics router.

GET /api/usage  — returns all-time LLM token usage and estimated cost.
DELETE /api/usage  — resets the stored usage data.
"""

import logging

from fastapi import APIRouter

from services.cost_service import get_global_usage, reset_global_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("")
def get_usage():
    """Return all-time LLM usage statistics and estimated dollar cost."""
    return get_global_usage()


@router.delete("", status_code=204)
def delete_usage():
    """Reset all stored usage statistics."""
    reset_global_usage()
    return None
