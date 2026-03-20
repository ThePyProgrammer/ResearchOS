"""FastAPI router for AI experiment gap analysis.

Provides POST /api/projects/{project_id}/gap-analysis.
"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from agents.gap_analyzer import run_gap_analysis
from models.gap_suggestion import GapAnalysisRequest
from services import project_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/projects/{project_id}/gap-analysis")
async def analyze_gaps(project_id: str, req: GapAnalysisRequest) -> JSONResponse:
    """Run AI gap analysis on a project's experiment tree.

    Returns a list of GapSuggestion objects as camelCase JSON.
    Raises 404 if the project does not exist.
    """
    project = project_service.get_project(project_id)
    if project is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "detail": f"Project '{project_id}' not found"},
        )

    logger.info("Gap analysis requested for project %s (dismissed: %s)", project_id, req.dismissed_ids)

    suggestions = await run_gap_analysis(project_id, dismissed_ids=req.dismissed_ids)

    return JSONResponse([s.model_dump(by_alias=True) for s in suggestions])
