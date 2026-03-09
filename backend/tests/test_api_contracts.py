from __future__ import annotations

from typing import Any

import pytest

from conftest import make_models


def assert_camel_case_payload(value: Any) -> None:
    if isinstance(value, list):
        for item in value:
            assert_camel_case_payload(item)
        return
    if isinstance(value, dict):
        for key, nested in value.items():
            assert "_" not in key, f"snake_case key leaked in API response: {key}"
            assert_camel_case_payload(nested)


@pytest.mark.parametrize(
    ("path", "patch_target", "payload", "expected_key"),
    [
        ("/api/libraries", "app.libraries.library_service.list_libraries", [{"id": "lib_1", "createdAt": "2026-03-09T00:00:00Z", "autoNoteEnabled": True}], "autoNoteEnabled"),
        ("/api/papers", "app.papers.paper_service.list_papers", [{"id": "p_1", "createdAt": "2026-03-09T00:00:00Z", "pdfUrl": None}], "pdfUrl"),
        ("/api/websites", "app.websites.website_service.list_websites", [{"id": "w_1", "publishedDate": "2026-03-09", "itemType": "website"}], "publishedDate"),
        ("/api/collections", "app.collections.collection_service.list_collections", [{"id": "c_1", "parentId": None, "paperCount": 0}], "paperCount"),
        ("/api/workflows", "app.workflows.workflow_service.list_workflows", [{"id": "wf_1", "estimatedTime": "5m", "canRunDirectly": True}], "canRunDirectly"),
        ("/api/runs", "app.runs.run_service.list_runs", [{"id": "run_1", "workflowId": "wf_1", "startedAt": "2026-03-09T00:00:00Z"}], "startedAt"),
        ("/api/proposals", "app.proposals.proposal_service.list_proposals", [{"id": "pr_1", "paperId": "p_1", "runId": "run_1"}], "paperId"),
        ("/api/activity", "app.activity.activity_service.list_activity", [{"id": "a_1", "iconBg": "bg-blue-100", "iconColor": "text-blue-600"}], "iconBg"),
    ],
)
def test_list_endpoints_return_camel_case_json(client, mocker, path, patch_target, payload, expected_key):
    mocker.patch(patch_target, return_value=make_models(payload))

    response = client.get(path)

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert body
    assert expected_key in body[0]
    assert_camel_case_payload(body)


def test_delete_endpoint_returns_empty_body_on_204(client, mocker):
    mocker.patch("app.papers.paper_service.get_paper", return_value=object())
    mocker.patch("app.papers.paper_service.delete_paper", return_value=True)

    response = client.delete("/api/papers/p_1")

    assert response.status_code == 204
    assert response.content == b""
