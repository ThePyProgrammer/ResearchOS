from __future__ import annotations

import pytest

from models.paper import Paper
from services import dedup_service, import_service, search_service


def _paper(id: str, title: str, doi: str | None = None, arxiv_id: str | None = None) -> Paper:
    return Paper(
        id=id,
        title=title,
        authors=["Author"],
        year=2024,
        venue="Venue",
        doi=doi,
        arxiv_id=arxiv_id,
        status="inbox",
        source="human",
        created_at="2026-03-09T00:00:00Z",
    )


def test_dedup_precedence_and_confidence(mocker):
    mocker.patch(
        "services.dedup_service.paper_service.list_papers",
        return_value=[
            _paper("p_doi", "A title", doi="10.1000/x"),
            _paper("p_arxiv", "B title", arxiv_id="2401.00001"),
            _paper("p_title", "Attention: Is All You Need!"),
        ],
    )

    results = dedup_service.find_duplicates(
        title="Attention Is All You Need",
        doi="10.1000/x",
        arxiv_id="2401.00001",
    )

    assert [r.match_field for r in results] == ["doi", "arxiv_id", "title"]
    assert [r.confidence for r in results] == ["exact", "exact", "likely"]


def test_detect_type_classifies_supported_identifiers():
    assert import_service.detect_type("10.1234/abc")[0] == "doi"
    assert import_service.detect_type("https://doi.org/10.1234/abc")[0] == "doi"
    assert import_service.detect_type("2303.01234")[0] == "arxiv"
    assert import_service.detect_type("https://arxiv.org/abs/2303.01234v2")[1] == "2303.01234"
    assert import_service.detect_type("https://example.org/paper")[0] == "url"


@pytest.mark.anyio
async def test_semantic_search_falls_back_to_lexical(mocker):
    papers = [_paper("p_1", "Transformer paper")]
    mocker.patch("services.search_service._embed", return_value=None)
    fallback = [(papers[0], 7.0)]
    lexical_mock = mocker.patch("services.search_service.lexical_search", return_value=fallback)

    result = await search_service.semantic_search("transformer", papers, limit=5)

    lexical_mock.assert_called_once_with("transformer", papers, 5)
    assert result == fallback
