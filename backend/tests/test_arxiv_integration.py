from __future__ import annotations

import pytest

from agents import base as agents_base
from services import import_service

ARXIV_ENTRY_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2501.18837v1</id>
    <title> Test Paper Title </title>
    <summary> Test abstract. </summary>
    <published>2025-01-30T00:00:00Z</published>
    <author><name>Alice Example</name></author>
    <link href="https://arxiv.org/pdf/2501.18837" type="application/pdf" />
  </entry>
</feed>
"""


@pytest.mark.anyio
async def test_import_arxiv_uses_shared_client(monkeypatch):
    calls = []

    async def fake_fetch(params, timeout=30.0):
        calls.append((dict(params), timeout))
        return ARXIV_ENTRY_XML

    monkeypatch.setattr(import_service.arxiv_client, "fetch_arxiv_xml", fake_fetch)

    result = await import_service._fetch_arxiv("2501.18837")

    assert calls == [({"id_list": "2501.18837"}, 15.0)]
    assert result["title"] == "Test Paper Title"
    assert result["arxiv_id"] == "2501.18837"
    assert result["pdf_url"] == "https://arxiv.org/pdf/2501.18837"


@pytest.mark.anyio
async def test_agent_search_arxiv_uses_shared_client(monkeypatch):
    calls = []

    async def fake_fetch(params, timeout=30.0):
        calls.append((dict(params), timeout))
        return ARXIV_ENTRY_XML

    monkeypatch.setattr(agents_base.arxiv_client, "fetch_arxiv_xml", fake_fetch)

    result = await agents_base.search_arxiv("test paper", max_results=7)

    assert calls == [({"search_query": "all:%22test+paper%22", "start": 0, "max_results": 7}, 30.0)]
    assert result == [
        {
            "title": "Test Paper Title",
            "arxiv_id": "2501.18837",
            "abstract": "Test abstract.",
            "authors": ["Alice Example"],
            "year": 2025,
            "url": "https://arxiv.org/abs/2501.18837",
        }
    ]
