"""Route-level tests for POST /api/experiments/:id/duplicate endpoint.

Uses monkeypatching to avoid DB calls — tests only the HTTP layer.
"""
from __future__ import annotations

import pytest
from conftest import DummyModel

# ---------------------------------------------------------------------------
# Payload constants
# ---------------------------------------------------------------------------

_EXPERIMENT_PAYLOAD = {
    "id": "exp_clone1",
    "projectId": "proj_1",
    "parentId": None,
    "rqId": None,
    "name": "Test Experiment (copy)",
    "status": "planned",
    "config": {"lr": "0.001", "epochs": "100"},
    "metrics": {},
    "position": 0,
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
}


# ---------------------------------------------------------------------------
# POST /api/experiments/:id/duplicate — shallow clone (EXP-09)
# ---------------------------------------------------------------------------

def test_duplicate_experiment_shallow(client, mocker):
    """Shallow duplicate copies name + config; metrics empty, status planned."""
    mocker.patch(
        "app.experiments.experiment_service.duplicate_experiment",
        return_value=DummyModel(_EXPERIMENT_PAYLOAD),
    )
    response = client.post("/api/experiments/exp_123/duplicate")
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Test Experiment (copy)"
    assert body["metrics"] == {}
    assert body["status"] == "planned"


def test_duplicate_experiment_deep(client, mocker):
    """Deep clone flag is forwarded to the service layer."""
    mock_dup = mocker.patch(
        "app.experiments.experiment_service.duplicate_experiment",
        return_value=DummyModel(_EXPERIMENT_PAYLOAD),
    )
    response = client.post("/api/experiments/exp_123/duplicate?deep=true")
    assert response.status_code == 201
    # Verify the service was called with deep=True
    mock_dup.assert_called_once()
    call_kwargs = mock_dup.call_args
    # deep=True should be passed as a keyword argument or positional
    assert True in call_kwargs.args or call_kwargs.kwargs.get("deep") is True


def test_duplicate_experiment_not_found(client, mocker):
    """Returns 404 when the source experiment does not exist."""
    mocker.patch(
        "app.experiments.experiment_service.duplicate_experiment",
        return_value=None,
    )
    response = client.post("/api/experiments/exp_nonexistent/duplicate")
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Experiment not found"}
