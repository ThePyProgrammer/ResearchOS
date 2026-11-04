"""Bounded provider requests; error messages never include API-key-bearing URLs."""
import os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx


class CitationProviderError(Exception):
    def __init__(self, message: str, *, retryable: bool = False, retry_after: int = 60):
        super().__init__(message)
        self.retryable = retryable
        self.retry_after = retry_after


def retry_seconds(value: str | None) -> int:
    try:
        return max(1, int(value))
    except (ValueError, TypeError):
        try:
            return max(1, int((parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()))
        except (ValueError, TypeError, OverflowError):
            return 60


async def get_json(client: httpx.AsyncClient, url: str, *, params: dict | None = None) -> dict | None:
    try:
        response = await client.get(url, params=params)
    except httpx.RequestError:
        raise CitationProviderError("Provider connection failed", retryable=True) from None
    if response.status_code == 404:
        return None
    if response.status_code >= 400:
        raise CitationProviderError(
            f"Provider returned HTTP {response.status_code}",
            retryable=response.status_code == 429 or response.status_code >= 500,
            retry_after=retry_seconds(response.headers.get("Retry-After")),
        )
    try:
        data = response.json()
    except ValueError:
        raise CitationProviderError("Provider returned invalid JSON", retryable=True) from None
    if not isinstance(data, dict):
        raise CitationProviderError("Provider returned an invalid response")
    return data


async def search(client: httpx.AsyncClient, **params) -> list[dict]:
    key = os.environ.get("OPENALEX_API_KEY")
    if key and key != "*":
        params["api_key"] = key
    data = await get_json(client, "https://api.openalex.org/works", params={"per_page": 10, **params})
    if data is None or not isinstance(data.get("results"), list):
        raise CitationProviderError("OpenAlex returned no results array")
    return data["results"]
