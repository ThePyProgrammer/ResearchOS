"""Tests for batch tagging, embedding, and notes preview.

Covers:
- extract_keywords_for_items (papers, websites, github repos, skip logic)
- batch_index_embeddings (wraps search_service index functions)
- batch_notes_preview (detects existing AI Notes folders)
- Route-level tests for POST /api/batch/tags, /embeddings, /notes/preview
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers to build fake domain objects
# ---------------------------------------------------------------------------

class _FakePaper:
    def __init__(self, id, title="Test Paper", abstract="Some abstract", tags=None):
        self.id = id
        self.title = title
        self.abstract = abstract
        self.tags = tags or []
        self.item_type = "paper"


class _FakeWebsite:
    def __init__(self, id, title="Test Website", description="Some description", tags=None):
        self.id = id
        self.title = title
        self.description = description
        self.abstract = None  # websites don't have abstract field
        self.tags = tags or []
        self.item_type = "website"


class _FakeGitHubRepo:
    def __init__(self, id, title="Test Repo", abstract=None, description="Repo description", tags=None):
        self.id = id
        self.title = title
        self.abstract = abstract
        self.description = description
        self.tags = tags or []
        self.item_type = "github_repo"


# ---------------------------------------------------------------------------
# Service-layer tests: extract_keywords_for_items
# ---------------------------------------------------------------------------

class TestExtractKeywordsForItems:
    """Tests for the extract_keywords_for_items service function."""

    def _make_openai_response(self, tag_map: dict) -> MagicMock:
        """Build a fake OpenAI completion response."""
        import json
        response = MagicMock()
        response.choices = [MagicMock()]
        response.choices[0].message.content = json.dumps(tag_map)
        response.usage = MagicMock()
        return response

    def test_tags_untagged_paper(self, mocker):
        """extract_keywords_for_items with a paper ID that has no tags returns updated=1."""
        paper = _FakePaper("p1", abstract="A deep learning paper")
        mocker.patch(
            "services.keyword_extraction_service.paper_service.get_paper",
            return_value=paper,
        )
        mocker.patch(
            "services.keyword_extraction_service.website_service.get_website",
            return_value=None,
        )
        mocker.patch(
            "services.keyword_extraction_service.github_repo_service.get_github_repo",
            return_value=None,
        )
        mock_update = mocker.patch(
            "services.keyword_extraction_service.paper_service.update_paper",
        )
        fake_client = MagicMock()
        fake_client.chat.completions.create.return_value = self._make_openai_response(
            {"p1": ["machine learning", "deep learning"]}
        )
        mocker.patch(
            "services.keyword_extraction_service._get_openai_client",
            return_value=fake_client,
        )
        mocker.patch("services.keyword_extraction_service.record_openai_usage")

        from services.keyword_extraction_service import extract_keywords_for_items
        result = extract_keywords_for_items(["p1"])

        assert result["updated"] == 1
        assert result["skipped"] == 0
        assert result["total"] == 1
        mock_update.assert_called_once()

    def test_tags_untagged_website(self, mocker):
        """extract_keywords_for_items with a website ID returns updated=1."""
        website = _FakeWebsite("w_abc123", description="A web page about NLP")
        mocker.patch(
            "services.keyword_extraction_service.website_service.get_website",
            return_value=website,
        )
        mocker.patch(
            "services.keyword_extraction_service.paper_service.get_paper",
            return_value=None,
        )
        mocker.patch(
            "services.keyword_extraction_service.github_repo_service.get_github_repo",
            return_value=None,
        )
        mock_update = mocker.patch(
            "services.keyword_extraction_service.website_service.update_website",
        )
        fake_client = MagicMock()
        fake_client.chat.completions.create.return_value = self._make_openai_response(
            {"w_abc123": ["nlp", "web resource"]}
        )
        mocker.patch(
            "services.keyword_extraction_service._get_openai_client",
            return_value=fake_client,
        )
        mocker.patch("services.keyword_extraction_service.record_openai_usage")

        from services.keyword_extraction_service import extract_keywords_for_items
        result = extract_keywords_for_items(["w_abc123"])

        assert result["updated"] == 1
        assert result["skipped"] == 0
        assert result["total"] == 1
        mock_update.assert_called_once()

    def test_tags_untagged_github_repo(self, mocker):
        """extract_keywords_for_items with a GitHub repo ID returns updated=1."""
        repo = _FakeGitHubRepo("gh_repo1", abstract="A machine learning repository")
        mocker.patch(
            "services.keyword_extraction_service.github_repo_service.get_github_repo",
            return_value=repo,
        )
        mocker.patch(
            "services.keyword_extraction_service.paper_service.get_paper",
            return_value=None,
        )
        mocker.patch(
            "services.keyword_extraction_service.website_service.get_website",
            return_value=None,
        )
        mock_update = mocker.patch(
            "services.keyword_extraction_service.github_repo_service.update_github_repo",
        )
        fake_client = MagicMock()
        fake_client.chat.completions.create.return_value = self._make_openai_response(
            {"gh_repo1": ["machine learning", "open source"]}
        )
        mocker.patch(
            "services.keyword_extraction_service._get_openai_client",
            return_value=fake_client,
        )
        mocker.patch("services.keyword_extraction_service.record_openai_usage")

        from services.keyword_extraction_service import extract_keywords_for_items
        result = extract_keywords_for_items(["gh_repo1"])

        assert result["updated"] == 1
        assert result["skipped"] == 0
        assert result["total"] == 1
        mock_update.assert_called_once()

    def test_skips_items_already_tagged(self, mocker):
        """extract_keywords_for_items skips items that already have tags."""
        paper = _FakePaper("p2", abstract="An abstract", tags=["existing-tag"])
        mocker.patch(
            "services.keyword_extraction_service.paper_service.get_paper",
            return_value=paper,
        )
        mocker.patch(
            "services.keyword_extraction_service.website_service.get_website",
            return_value=None,
        )
        mocker.patch(
            "services.keyword_extraction_service.github_repo_service.get_github_repo",
            return_value=None,
        )
        mock_update = mocker.patch(
            "services.keyword_extraction_service.paper_service.update_paper",
        )
        mocker.patch(
            "services.keyword_extraction_service._get_openai_client",
        )
        mocker.patch("services.keyword_extraction_service.record_openai_usage")

        from services.keyword_extraction_service import extract_keywords_for_items
        result = extract_keywords_for_items(["p2"])

        assert result["updated"] == 0
        assert result["skipped"] == 1
        assert result["total"] == 1
        mock_update.assert_not_called()

    def test_skips_items_with_no_abstract(self, mocker):
        """extract_keywords_for_items skips items with no abstract/description."""
        paper = _FakePaper("p3", abstract="", tags=[])
        mocker.patch(
            "services.keyword_extraction_service.paper_service.get_paper",
            return_value=paper,
        )
        mocker.patch(
            "services.keyword_extraction_service.website_service.get_website",
            return_value=None,
        )
        mocker.patch(
            "services.keyword_extraction_service.github_repo_service.get_github_repo",
            return_value=None,
        )
        mock_update = mocker.patch(
            "services.keyword_extraction_service.paper_service.update_paper",
        )
        mocker.patch(
            "services.keyword_extraction_service._get_openai_client",
        )
        mocker.patch("services.keyword_extraction_service.record_openai_usage")

        from services.keyword_extraction_service import extract_keywords_for_items
        result = extract_keywords_for_items(["p3"])

        assert result["updated"] == 0
        assert result["skipped"] == 1
        assert result["total"] == 1
        mock_update.assert_not_called()


# ---------------------------------------------------------------------------
# Service-layer tests: batch_index_embeddings
# ---------------------------------------------------------------------------

class TestBatchIndexEmbeddings:
    """Tests for batch_index_embeddings in batch_service."""

    def test_indexes_found_items(self, mocker):
        """batch_index_embeddings indexes items that are found and returns counts."""
        import asyncio

        paper = _FakePaper("p1")
        mocker.patch(
            "services.batch_service.paper_service.get_paper",
            return_value=paper,
        )
        mocker.patch(
            "services.batch_service.website_service.get_website",
            return_value=None,
        )
        mocker.patch(
            "services.batch_service.github_repo_service.get_github_repo",
            return_value=None,
        )
        mock_index_paper = mocker.patch(
            "services.batch_service.search_service.index_paper",
            new_callable=AsyncMock,
        )

        from services.batch_service import batch_index_embeddings
        result = asyncio.run(batch_index_embeddings(["p1"]))

        assert result["processed"] == 1
        assert result["not_found"] == 0
        mock_index_paper.assert_called_once_with(paper)

    def test_counts_not_found_items(self, mocker):
        """batch_index_embeddings returns not_found for items that don't exist."""
        import asyncio

        mocker.patch(
            "services.batch_service.paper_service.get_paper",
            return_value=None,
        )
        mocker.patch(
            "services.batch_service.website_service.get_website",
            return_value=None,
        )
        mocker.patch(
            "services.batch_service.github_repo_service.get_github_repo",
            return_value=None,
        )

        from services.batch_service import batch_index_embeddings
        result = asyncio.run(batch_index_embeddings(["nonexistent_id"]))

        assert result["processed"] == 0
        assert result["not_found"] == 1


# ---------------------------------------------------------------------------
# Service-layer tests: batch_notes_preview (test_notes_skip_existing)
# ---------------------------------------------------------------------------

class TestBatchNotesPreview:
    """Tests for batch_notes_preview — detects existing AI Notes folders."""

    def test_notes_skip_existing(self, mocker):
        """batch_notes_preview returns skip_ids for items with existing AI Notes folders.

        Tests with a mix of paper, website, and github_repo IDs.
        """
        # Mock the DB query result — p1 and w_site1 have AI Notes, gh_repo1 does not
        mock_execute = MagicMock()
        mock_execute.data = [
            {"paper_id": "p1", "website_id": None, "github_repo_id": None},
            {"paper_id": None, "website_id": "w_site1", "github_repo_id": None},
        ]
        mock_query = MagicMock()
        mock_query.execute.return_value = mock_execute

        mock_table = MagicMock()
        mock_table.select.return_value = mock_query
        mock_query.eq.return_value = mock_query  # chaining: .eq().eq()

        mock_client = MagicMock()
        mock_client.table.return_value = mock_table

        mocker.patch(
            "services.batch_service.get_client",
            return_value=mock_client,
        )

        from services.batch_service import batch_notes_preview
        result = batch_notes_preview(["p1", "w_site1", "gh_repo1"])

        assert set(result["skip_ids"]) == {"p1", "w_site1"}
        assert result["process_ids"] == ["gh_repo1"]

    def test_all_items_need_processing(self, mocker):
        """batch_notes_preview returns all items in process_ids when none have AI Notes."""
        mock_execute = MagicMock()
        mock_execute.data = []
        mock_query = MagicMock()
        mock_query.execute.return_value = mock_execute
        mock_query.eq.return_value = mock_query

        mock_table = MagicMock()
        mock_table.select.return_value = mock_query

        mock_client = MagicMock()
        mock_client.table.return_value = mock_table

        mocker.patch(
            "services.batch_service.get_client",
            return_value=mock_client,
        )

        from services.batch_service import batch_notes_preview
        result = batch_notes_preview(["p1", "p2"])

        assert result["skip_ids"] == []
        assert set(result["process_ids"]) == {"p1", "p2"}


# ---------------------------------------------------------------------------
# Route-level tests
# ---------------------------------------------------------------------------

class TestBatchRoutes:
    """Route-level tests for POST /api/batch/* endpoints."""

    def test_post_tags_returns_counts(self, client, mocker):
        """POST /api/batch/tags with mocked extract_keywords_for_items returns counts."""
        mocker.patch(
            "routers.batch.extract_keywords_for_items",
            return_value={"updated": 3, "skipped": 1, "total": 4},
        )
        response = client.post(
            "/api/batch/tags",
            json={"item_ids": ["p1", "p2", "p3", "p4"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["updated"] == 3
        assert body["skipped"] == 1
        assert body["total"] == 4

    def test_post_embeddings_returns_counts(self, client, mocker):
        """POST /api/batch/embeddings with mocked batch_index_embeddings returns counts."""
        mocker.patch(
            "routers.batch.batch_index_embeddings",
            new_callable=AsyncMock,
            return_value={"processed": 5, "not_found": 1},
        )
        response = client.post(
            "/api/batch/embeddings",
            json={"item_ids": ["p1", "p2", "p3", "p4", "p5", "p6"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["processed"] == 5
        assert body["not_found"] == 1

    def test_post_notes_preview_returns_ids(self, client, mocker):
        """POST /api/batch/notes/preview returns skip_ids and process_ids."""
        mocker.patch(
            "routers.batch.batch_notes_preview",
            return_value={"skip_ids": ["p1"], "process_ids": ["p2", "p3"]},
        )
        response = client.post(
            "/api/batch/notes/preview",
            json={"item_ids": ["p1", "p2", "p3"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["skip_ids"] == ["p1"]
        assert body["process_ids"] == ["p2", "p3"]

    def test_post_tags_with_library_id(self, client, mocker):
        """POST /api/batch/tags passes library_id to extract_keywords_for_items."""
        mock_fn = mocker.patch(
            "routers.batch.extract_keywords_for_items",
            return_value={"updated": 1, "skipped": 0, "total": 1},
        )
        response = client.post(
            "/api/batch/tags",
            json={"item_ids": ["p1"], "library_id": "lib_default"},
        )
        assert response.status_code == 200
        mock_fn.assert_called_once_with(["p1"], library_id="lib_default")
