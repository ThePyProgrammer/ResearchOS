"""Unit and route-level tests for keyword extraction service and endpoint.

Uses monkeypatching to avoid DB and OpenAI calls — tests only the service
logic and HTTP layer.

Test plan:
- already-tagged papers are skipped
- papers without abstracts are skipped
- OpenAI is NOT called when all papers already have tags (or no abstracts)
- response JSON maps paper IDs to tag lists correctly
- endpoint returns 404 when project not found
- endpoint returns result object with updated/skipped/total counts
"""
from __future__ import annotations

import json
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from conftest import DummyModel

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_project_paper(paper_id: Optional[str] = None, website_id: Optional[str] = None):
    """Return a minimal ProjectPaper-like object with a paper_id field."""
    m = MagicMock()
    m.paper_id = paper_id
    m.website_id = website_id
    return m


def _make_paper(pid: str, tags: list[str], abstract: Optional[str]):
    """Return a minimal Paper-like object."""
    m = MagicMock()
    m.id = pid
    m.title = f"Paper {pid}"
    m.tags = tags
    m.abstract = abstract
    return m


def _make_openai_response(mapping: dict[str, list[str]]) -> MagicMock:
    """Return a mock OpenAI ChatCompletion response with JSON content."""
    choice = MagicMock()
    choice.message.content = json.dumps(mapping)
    response = MagicMock()
    response.choices = [choice]
    response.usage = MagicMock()
    return response


# ---------------------------------------------------------------------------
# Service-layer tests (direct function calls, no HTTP)
# ---------------------------------------------------------------------------

class TestExtractKeywordsForProject:
    """Tests for keyword_extraction_service.extract_keywords_for_project()."""

    def test_already_tagged_papers_are_skipped(self, monkeypatch):
        """Papers with non-empty tags must not be updated."""
        import services.keyword_extraction_service as svc

        monkeypatch.setattr(
            "services.keyword_extraction_service.project_papers_service.list_project_papers",
            lambda pid: [_make_project_paper(paper_id="p1"), _make_project_paper(paper_id="p2")],
        )
        monkeypatch.setattr(
            "services.keyword_extraction_service.paper_service.get_paper",
            lambda pid: _make_paper(pid, tags=["deep-learning", "nlp"], abstract="Some abstract."),
        )
        mock_client = MagicMock()
        monkeypatch.setattr("services.keyword_extraction_service._get_openai_client", lambda: mock_client)

        result = svc.extract_keywords_for_project("proj_1")

        # OpenAI should NOT be called because both papers already have tags
        mock_client.chat.completions.create.assert_not_called()
        assert result["updated"] == 0
        assert result["skipped"] == 2
        assert result["total"] == 2

    def test_papers_without_abstracts_are_skipped(self, monkeypatch):
        """Papers with empty/None abstracts must not be sent to OpenAI."""
        import services.keyword_extraction_service as svc

        monkeypatch.setattr(
            "services.keyword_extraction_service.project_papers_service.list_project_papers",
            lambda pid: [_make_project_paper(paper_id="p1"), _make_project_paper(paper_id="p2")],
        )
        papers = {
            "p1": _make_paper("p1", tags=[], abstract=None),
            "p2": _make_paper("p2", tags=[], abstract=""),
        }
        monkeypatch.setattr(
            "services.keyword_extraction_service.paper_service.get_paper",
            lambda pid: papers.get(pid),
        )
        mock_client = MagicMock()
        monkeypatch.setattr("services.keyword_extraction_service._get_openai_client", lambda: mock_client)

        result = svc.extract_keywords_for_project("proj_1")

        mock_client.chat.completions.create.assert_not_called()
        assert result["updated"] == 0
        assert result["skipped"] == 2
        assert result["total"] == 2

    def test_openai_not_called_when_nothing_to_process(self, monkeypatch):
        """Early-return path: no candidates means no OpenAI call."""
        import services.keyword_extraction_service as svc

        monkeypatch.setattr(
            "services.keyword_extraction_service.project_papers_service.list_project_papers",
            lambda pid: [],
        )
        mock_client = MagicMock()
        monkeypatch.setattr("services.keyword_extraction_service._get_openai_client", lambda: mock_client)

        result = svc.extract_keywords_for_project("proj_1")

        mock_client.chat.completions.create.assert_not_called()
        assert result == {"updated": 0, "skipped": 0, "total": 0}

    def test_response_mapping_applied_to_papers(self, monkeypatch):
        """OpenAI response map is applied: each eligible paper gets its tags updated."""
        import services.keyword_extraction_service as svc
        from models.paper import PaperUpdate

        updated_papers: list[tuple[str, PaperUpdate]] = []

        monkeypatch.setattr(
            "services.keyword_extraction_service.project_papers_service.list_project_papers",
            lambda pid: [_make_project_paper(paper_id="p1"), _make_project_paper(paper_id="p2")],
        )
        papers = {
            "p1": _make_paper("p1", tags=[], abstract="Abstract about transformers and NLP."),
            "p2": _make_paper("p2", tags=[], abstract="Abstract about reinforcement learning."),
        }
        monkeypatch.setattr(
            "services.keyword_extraction_service.paper_service.get_paper",
            lambda pid: papers.get(pid),
        )

        def mock_update(paper_id, data):
            updated_papers.append((paper_id, data))
            return papers[paper_id]

        monkeypatch.setattr("services.keyword_extraction_service.paper_service.update_paper", mock_update)

        openai_map = {
            "p1": ["transformers", "nlp", "attention"],
            "p2": ["reinforcement-learning", "policy-gradient"],
        }
        mock_response = _make_openai_response(openai_map)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        monkeypatch.setattr("services.keyword_extraction_service._get_openai_client", lambda: mock_client)

        # Suppress cost recording
        monkeypatch.setattr(
            "services.keyword_extraction_service.record_openai_usage",
            lambda *a, **kw: None,
        )

        result = svc.extract_keywords_for_project("proj_1")

        assert result["updated"] == 2
        assert result["skipped"] == 0
        assert result["total"] == 2

        # Verify update_paper was called with correct tags
        update_dict = {pid: data for pid, data in updated_papers}
        assert update_dict["p1"].tags == ["transformers", "nlp", "attention"]
        assert update_dict["p2"].tags == ["reinforcement-learning", "policy-gradient"]

    def test_already_tagged_mixed_with_untagged(self, monkeypatch):
        """Mixed set: tagged papers skipped, untagged papers processed."""
        import services.keyword_extraction_service as svc
        from models.paper import PaperUpdate

        updated_papers: list[str] = []

        monkeypatch.setattr(
            "services.keyword_extraction_service.project_papers_service.list_project_papers",
            lambda pid: [
                _make_project_paper(paper_id="p1"),
                _make_project_paper(paper_id="p2"),
                _make_project_paper(paper_id="p3"),
            ],
        )
        papers = {
            "p1": _make_paper("p1", tags=["existing-tag"], abstract="Some abstract."),
            "p2": _make_paper("p2", tags=[], abstract="Abstract about deep learning."),
            "p3": _make_paper("p3", tags=[], abstract="Abstract about graphs."),
        }
        monkeypatch.setattr(
            "services.keyword_extraction_service.paper_service.get_paper",
            lambda pid: papers.get(pid),
        )

        def mock_update(paper_id, data):
            updated_papers.append(paper_id)
            return papers[paper_id]

        monkeypatch.setattr("services.keyword_extraction_service.paper_service.update_paper", mock_update)

        openai_map = {
            "p2": ["deep-learning", "neural-networks"],
            "p3": ["graph-neural-networks", "gnn"],
        }
        mock_response = _make_openai_response(openai_map)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        monkeypatch.setattr("services.keyword_extraction_service._get_openai_client", lambda: mock_client)
        monkeypatch.setattr(
            "services.keyword_extraction_service.record_openai_usage",
            lambda *a, **kw: None,
        )

        result = svc.extract_keywords_for_project("proj_1")

        assert result["total"] == 3
        assert result["skipped"] == 1  # p1 already tagged
        assert result["updated"] == 2  # p2, p3 updated
        assert "p1" not in updated_papers
        assert "p2" in updated_papers
        assert "p3" in updated_papers

    def test_website_links_are_ignored(self, monkeypatch):
        """Links with website_id (not paper_id) are silently skipped."""
        import services.keyword_extraction_service as svc

        monkeypatch.setattr(
            "services.keyword_extraction_service.project_papers_service.list_project_papers",
            lambda pid: [_make_project_paper(website_id="ws_1")],
        )
        mock_get = MagicMock(return_value=None)
        monkeypatch.setattr("services.keyword_extraction_service.paper_service.get_paper", mock_get)
        mock_client = MagicMock()
        monkeypatch.setattr("services.keyword_extraction_service._get_openai_client", lambda: mock_client)

        result = svc.extract_keywords_for_project("proj_1")

        # No paper fetched for website links
        mock_get.assert_not_called()
        mock_client.chat.completions.create.assert_not_called()
        assert result["total"] == 0


# ---------------------------------------------------------------------------
# Route-level tests (HTTP layer via TestClient)
# ---------------------------------------------------------------------------

class TestExtractKeywordsRoute:
    """Tests for POST /api/projects/{project_id}/papers/extract-keywords."""

    def test_returns_200_with_result_object(self, client, mocker):
        """Happy-path: project exists, returns { updated, skipped, total }."""
        mocker.patch(
            "routers.projects.project_service.get_project",
            return_value=DummyModel({"id": "proj_1", "name": "Test Project"}),
        )
        mocker.patch(
            "routers.projects.keyword_extraction_service.extract_keywords_for_project",
            return_value={"updated": 3, "skipped": 1, "total": 4},
        )

        response = client.post("/api/projects/proj_1/papers/extract-keywords")

        assert response.status_code == 200
        body = response.json()
        assert body["updated"] == 3
        assert body["skipped"] == 1
        assert body["total"] == 4

    def test_returns_404_when_project_not_found(self, client, mocker):
        """Returns 404 when project_id does not exist."""
        mocker.patch(
            "routers.projects.project_service.get_project",
            return_value=None,
        )

        response = client.post("/api/projects/proj_999/papers/extract-keywords")

        assert response.status_code == 404
        body = response.json()
        assert "not_found" in str(body).lower() or response.status_code == 404

    def test_returns_zero_counts_when_nothing_to_update(self, client, mocker):
        """Returns { updated: 0, skipped: N, total: N } when all papers are tagged."""
        mocker.patch(
            "routers.projects.project_service.get_project",
            return_value=DummyModel({"id": "proj_1", "name": "Test Project"}),
        )
        mocker.patch(
            "routers.projects.keyword_extraction_service.extract_keywords_for_project",
            return_value={"updated": 0, "skipped": 5, "total": 5},
        )

        response = client.post("/api/projects/proj_1/papers/extract-keywords")

        assert response.status_code == 200
        body = response.json()
        assert body["updated"] == 0
        assert body["skipped"] == 5
        assert body["total"] == 5
