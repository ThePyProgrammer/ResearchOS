"""Route-level tests for POST /api/projects/{project_id}/gap-analysis.

Uses monkeypatching to avoid DB and LLM calls — tests only the HTTP layer.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

from conftest import DummyModel
from models.gap_suggestion import GapSuggestion, PaperRef

# ---------------------------------------------------------------------------
# Payload constants
# ---------------------------------------------------------------------------

_SUGGESTION_PAYLOAD = {
    "id": "gap_abc12345",
    "gapType": "missing_baseline",
    "name": "Add vanilla transformer baseline",
    "rationale": "No standard baseline comparison against the original transformer",
    "suggestedConfig": {"model": "transformer", "layers": 6},
    "paperRefs": [
        {
            "paperId": "p1",
            "displayLabel": "Vaswani et al., 2017",
            "relevanceNote": "Original transformer architecture used as baseline in similar studies",
        }
    ],
    "ablationParams": [],
}


def _make_suggestion() -> GapSuggestion:
    """Build a GapSuggestion model instance for mocking return values."""
    ref = PaperRef(
        paper_id="p1",
        display_label="Vaswani et al., 2017",
        relevance_note="Original transformer architecture used as baseline in similar studies",
    )
    return GapSuggestion(
        id="gap_abc12345",
        gap_type="missing_baseline",
        name="Add vanilla transformer baseline",
        rationale="No standard baseline comparison against the original transformer",
        suggested_config={"model": "transformer", "layers": 6},
        paper_refs=[ref],
        ablation_params=[],
    )


# ---------------------------------------------------------------------------
# POST /api/projects/{project_id}/gap-analysis
# ---------------------------------------------------------------------------


def test_analyze_gaps_returns_suggestions(client, mocker):
    """Returns 200 with a list of suggestion objects when project exists."""
    mocker.patch(
        "routers.gap_analysis.project_service.get_project",
        return_value=DummyModel({"id": "proj_1", "name": "Test Project"}),
    )
    mocker.patch(
        "routers.gap_analysis.run_gap_analysis",
        new_callable=AsyncMock,
        return_value=[_make_suggestion()],
    )

    response = client.post(
        "/api/projects/proj_1/gap-analysis",
        json={"dismissedIds": []},
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 1
    item = body[0]
    assert item["gapType"] == "missing_baseline"
    assert item["name"] == "Add vanilla transformer baseline"
    assert item["rationale"] == "No standard baseline comparison against the original transformer"


def test_analyze_gaps_project_not_found(client, mocker):
    """Returns 404 when project_id does not exist."""
    mocker.patch(
        "routers.gap_analysis.project_service.get_project",
        return_value=None,
    )

    response = client.post(
        "/api/projects/proj_999/gap-analysis",
        json={"dismissedIds": []},
    )
    assert response.status_code == 404


def test_analyze_gaps_with_dismissed_ids(client, mocker):
    """run_gap_analysis is called with the dismissed_ids from the request body."""
    mocker.patch(
        "routers.gap_analysis.project_service.get_project",
        return_value=DummyModel({"id": "proj_1", "name": "Test Project"}),
    )
    mock_run = mocker.patch(
        "routers.gap_analysis.run_gap_analysis",
        new_callable=AsyncMock,
        return_value=[],
    )

    response = client.post(
        "/api/projects/proj_1/gap-analysis",
        json={"dismissedIds": ["gap_abc", "gap_def"]},
    )
    assert response.status_code == 200
    # Verify dismissed_ids were forwarded to run_gap_analysis
    mock_run.assert_called_once()
    call_kwargs = mock_run.call_args
    # dismissed_ids should be passed as keyword argument
    assert call_kwargs.kwargs.get("dismissed_ids") == ["gap_abc", "gap_def"]


def test_paper_context_included(client, mocker):
    """run_gap_analysis is invoked (which internally fetches papers for context)."""
    mocker.patch(
        "routers.gap_analysis.project_service.get_project",
        return_value=DummyModel({"id": "proj_1", "name": "Test Project"}),
    )
    mock_run = mocker.patch(
        "routers.gap_analysis.run_gap_analysis",
        new_callable=AsyncMock,
        return_value=[_make_suggestion()],
    )

    response = client.post(
        "/api/projects/proj_1/gap-analysis",
        json={"dismissedIds": []},
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 1
    # Verify run_gap_analysis was called with the project_id
    mock_run.assert_called_once()
    call_args = mock_run.call_args
    assert call_args.args[0] == "proj_1" or call_args.kwargs.get("project_id") == "proj_1"


def test_analyze_gaps_response_has_camel_keys(client, mocker):
    """Response items have camelCase keys (gapType, suggestedConfig, paperRefs)."""
    mocker.patch(
        "routers.gap_analysis.project_service.get_project",
        return_value=DummyModel({"id": "proj_1", "name": "Test Project"}),
    )
    mocker.patch(
        "routers.gap_analysis.run_gap_analysis",
        new_callable=AsyncMock,
        return_value=[_make_suggestion()],
    )

    response = client.post(
        "/api/projects/proj_1/gap-analysis",
        json={"dismissedIds": []},
    )
    assert response.status_code == 200
    item = response.json()[0]
    # camelCase keys should be present
    assert "gapType" in item
    assert "suggestedConfig" in item
    assert "paperRefs" in item
    assert "ablationParams" in item
    # snake_case keys should NOT appear
    assert "gap_type" not in item
    assert "suggested_config" not in item
    assert "paper_refs" not in item
    assert "ablation_params" not in item
