"""Settings router — global app configuration (model selection, etc.)."""

from fastapi import APIRouter, Query

from agents.llm import get_all_models, update_models

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/models")
async def list_model_settings(refresh: bool = Query(False, description="Force re-fetch models from OpenAI API")):
    """Return current model assignments and available models."""
    return get_all_models(force_refresh=refresh)


@router.patch("/models")
async def update_model_settings(body: dict):
    """Update model assignments for one or more roles."""
    current = update_models(body)
    return {"current": current}
