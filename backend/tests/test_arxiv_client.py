from __future__ import annotations

import httpx
import pytest

from services import arxiv_client


@pytest.fixture(autouse=True)
def reset_arxiv_client_state():
    arxiv_client._cache.clear()
    arxiv_client._last_request_started_at = None


@pytest.mark.anyio
async def test_fetch_arxiv_xml_caches_identical_requests(monkeypatch):
    calls = []

    async def fake_request(params, timeout):
        calls.append(dict(params))
        request = httpx.Request("GET", "https://export.arxiv.org/api/query")
        return httpx.Response(200, content=b"<feed>cached</feed>", request=request)

    monkeypatch.setattr(arxiv_client, "_request_arxiv_api", fake_request)

    first = await arxiv_client.fetch_arxiv_xml({"id_list": "2501.18837"})
    second = await arxiv_client.fetch_arxiv_xml({"id_list": "2501.18837"})

    assert first == b"<feed>cached</feed>"
    assert second == first
    assert calls == [{"id_list": "2501.18837"}]


@pytest.mark.anyio
async def test_fetch_arxiv_xml_waits_between_uncached_requests(monkeypatch):
    now = 100.0
    sleeps = []

    def fake_monotonic():
        return now

    async def fake_sleep(seconds):
        nonlocal now
        sleeps.append(seconds)
        now += seconds

    async def fake_request(params, timeout):
        request = httpx.Request("GET", "https://export.arxiv.org/api/query")
        return httpx.Response(200, content=f"<feed>{params['id_list']}</feed>".encode(), request=request)

    monkeypatch.setattr(arxiv_client, "_monotonic", fake_monotonic)
    monkeypatch.setattr(arxiv_client, "_sleep", fake_sleep)
    monkeypatch.setattr(arxiv_client, "_request_arxiv_api", fake_request)

    await arxiv_client.fetch_arxiv_xml({"id_list": "2501.18837"})
    await arxiv_client.fetch_arxiv_xml({"id_list": "2501.18838"})

    assert sleeps == [3.0]


@pytest.mark.anyio
async def test_fetch_arxiv_xml_reports_rate_limit_clearly(monkeypatch):
    async def fake_request(params, timeout):
        request = httpx.Request("GET", "https://export.arxiv.org/api/query")
        return httpx.Response(429, content=b"Rate exceeded.", request=request)

    monkeypatch.setattr(arxiv_client, "_request_arxiv_api", fake_request)

    with pytest.raises(arxiv_client.ArxivRateLimitError, match="arXiv is rate-limiting"):
        await arxiv_client.fetch_arxiv_xml({"id_list": "2501.18837"})
