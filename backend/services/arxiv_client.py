from __future__ import annotations

import asyncio
from time import monotonic as _monotonic
from typing import Mapping
from urllib.parse import urlencode

import httpx

_ARXIV_API_URL = "https://export.arxiv.org/api/query"
_CACHE_TTL_SECONDS = 24 * 60 * 60
_MIN_REQUEST_INTERVAL_SECONDS = 3.0
_USER_AGENT = "ResearchOS/0.1 (mailto:researchos@localhost)"

_cache: dict[tuple[tuple[str, str], ...], tuple[float, bytes]] = {}
_request_lock = asyncio.Lock()
_last_request_started_at: float | None = None
_sleep = asyncio.sleep


class ArxivRequestError(RuntimeError):
    pass


class ArxivRateLimitError(ArxivRequestError):
    pass


def _cache_key(params: Mapping[str, object]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((key, str(value)) for key, value in params.items()))


async def _request_arxiv_api(params: Mapping[str, object], timeout: float) -> httpx.Response:
    query = urlencode({key: str(value) for key, value in params.items()}, safe="%:+")
    async with httpx.AsyncClient(headers={"User-Agent": _USER_AGENT}, timeout=timeout) as client:
        return await client.get(f"{_ARXIV_API_URL}?{query}")


def _rate_limit_message(response: httpx.Response) -> str:
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        return f"arXiv is rate-limiting this connection. Try again after {retry_after} seconds."
    return "arXiv is rate-limiting this connection. Wait before retrying."


async def fetch_arxiv_xml(params: Mapping[str, object], timeout: float = 30.0) -> bytes:
    key = _cache_key(params)
    now = _monotonic()
    cached = _cache.get(key)
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    async with _request_lock:
        now = _monotonic()
        cached = _cache.get(key)
        if cached and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

        global _last_request_started_at
        if _last_request_started_at is not None:
            wait_seconds = _MIN_REQUEST_INTERVAL_SECONDS - (now - _last_request_started_at)
            if wait_seconds > 0:
                await _sleep(wait_seconds)
                now = _monotonic()

        _last_request_started_at = now
        try:
            response = await _request_arxiv_api(params, timeout)
            if response.status_code == 429:
                raise ArxivRateLimitError(_rate_limit_message(response))
            response.raise_for_status()
        except ArxivRateLimitError:
            raise
        except httpx.TimeoutException as exc:
            raise ArxivRequestError("arXiv did not respond before the lookup timed out. Wait and retry.") from exc
        except httpx.HTTPError as exc:
            raise ArxivRequestError(f"arXiv lookup failed: {exc}") from exc
        content = response.content
        _cache[key] = (now, content)
        return content
