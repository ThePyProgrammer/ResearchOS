import asyncio
import logging
import os
import re
from collections import defaultdict
from typing import Optional

import httpx

from models.discovery import RelatedPaperCandidate, RelatedPapersResponse, RelatedReason
from models.paper import Paper
from services import dedup_service

logger = logging.getLogger(__name__)

_OPENALEX_BASE = "https://api.openalex.org"
_OPENALEX_UA = "ResearchOS/0.1 (mailto:researchos@localhost)"
_DOI_RE = re.compile(r"10\.\d{4,9}/\S+", re.IGNORECASE)
_ARXIV_RE = re.compile(r"(\d{4}\.\d{4,5})(v\d+)?$")


def _openalex_params(extra: Optional[dict] = None, *, include_api_key: bool = True) -> dict:
    params = dict(extra or {})
    api_key = os.environ.get("OPENALEX_API_KEY")
    if include_api_key and api_key:
        params["api_key"] = api_key
    return params


def _short_openalex_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    s = value.strip()
    if "/W" in s:
        return s.rsplit("/", 1)[-1]
    if s.startswith("W"):
        return s
    return None


def _normalize_doi(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    doi = value.strip()
    doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "")
    doi = doi.removeprefix("doi:").strip()
    m = _DOI_RE.search(doi)
    return m.group(0).lower() if m else None


def _extract_arxiv_id(work: dict) -> Optional[str]:
    ids = work.get("ids") or {}
    raw = ids.get("arxiv")
    if isinstance(raw, str) and raw:
        candidate = raw.rsplit("/", 1)[-1]
        m = _ARXIV_RE.search(candidate)
        if m:
            return m.group(1)
    return None


def _abstract_from_inverted_index(index: Optional[dict]) -> Optional[str]:
    if not isinstance(index, dict) or not index:
        return None

    max_pos = -1
    for positions in index.values():
        if isinstance(positions, list) and positions:
            max_pos = max(max_pos, max(positions))
    if max_pos < 0:
        return None

    tokens = [""] * (max_pos + 1)
    for token, positions in index.items():
        if not isinstance(token, str) or not isinstance(positions, list):
            continue
        for pos in positions:
            if isinstance(pos, int) and 0 <= pos <= max_pos:
                tokens[pos] = token
    text = " ".join(t for t in tokens if t).strip()
    return text[:2000] if text else None


def _venue_name(work: dict) -> str:
    primary = work.get("primary_location") or {}
    source = primary.get("source") or {}
    venue = (source.get("display_name") or "").strip()
    if venue:
        return venue
    host = work.get("host_venue") or {}
    return (host.get("display_name") or "Unknown").strip()


def _best_import_identifier(doi: Optional[str], arxiv_id: Optional[str]) -> Optional[str]:
    if doi:
        return doi
    if arxiv_id:
        return arxiv_id
    return None


def _reason_weight(reason_type: str) -> float:
    if reason_type == "semantic_related":
        return 1.0
    if reason_type == "cited_by_seed":
        return 0.8
    if reason_type == "seed_cites":
        return 0.7
    return 0.4


async def _get_json(client: httpx.AsyncClient, path: str, params: Optional[dict] = None) -> dict:
    try:
        response = await client.get(path, params=_openalex_params(params, include_api_key=True))
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        # Some OpenAlex deployments can reject invalid/expired API keys.
        # Retry once without api_key before failing.
        if exc.response.status_code in (401, 403) and os.environ.get("OPENALEX_API_KEY"):
            response = await client.get(path, params=_openalex_params(params, include_api_key=False))
            response.raise_for_status()
        else:
            raise
    data = response.json()
    if not isinstance(data, dict):
        raise RuntimeError("OpenAlex returned an unexpected response shape")
    return data


async def _search_one_work(client: httpx.AsyncClient, filter_expr: str) -> Optional[dict]:
    data = await _get_json(client, "/works", {"filter": filter_expr, "per-page": 1})
    results = data.get("results") or []
    if not results:
        return None
    return results[0] if isinstance(results[0], dict) else None


async def _resolve_seed_work(client: httpx.AsyncClient, paper: Paper) -> Optional[dict]:
    doi = _normalize_doi(paper.doi)
    if doi:
        work = await _search_one_work(client, f"doi:{doi}")
        if work:
            return work

    if paper.arxiv_id:
        data = await _get_json(client, "/works", {"search": paper.arxiv_id, "per-page": 10})
        arxiv_hits = [r for r in (data.get("results") or []) if isinstance(r, dict)]
        exact = next((w for w in arxiv_hits if _extract_arxiv_id(w) == paper.arxiv_id), None)
        if exact:
            return exact

    params = {"search": paper.title, "per-page": 5}
    data = await _get_json(client, "/works", params)
    results = [r for r in (data.get("results") or []) if isinstance(r, dict)]
    if not results:
        return None
    normalized_seed = paper.title.strip().lower()
    exact = next((w for w in results if (w.get("display_name") or "").strip().lower() == normalized_seed), None)
    return exact or results[0]


async def _fetch_work_by_id(client: httpx.AsyncClient, work_id: str) -> Optional[dict]:
    short_id = _short_openalex_id(work_id)
    if not short_id:
        return None
    data = await _get_json(client, f"/works/{short_id}")
    return data


async def _fetch_many_works(client: httpx.AsyncClient, work_ids: list[str]) -> list[dict]:
    tasks = [_fetch_work_by_id(client, wid) for wid in work_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    works: list[dict] = []
    for item in results:
        if isinstance(item, Exception):
            logger.warning("OpenAlex related work fetch failed: %s", item)
            continue
        if isinstance(item, dict):
            works.append(item)
    return works


async def _fetch_title_neighbors(client: httpx.AsyncClient, seed_title: str, limit: int) -> list[dict]:
    data = await _get_json(client, "/works", {"search": seed_title, "per-page": max(limit, 1)})
    return [r for r in (data.get("results") or []) if isinstance(r, dict)]


async def _fetch_cited_by_ids(client: httpx.AsyncClient, seed_work: dict, limit: int) -> list[str]:
    cited_by_url = seed_work.get("cited_by_api_url")
    if not isinstance(cited_by_url, str) or not cited_by_url:
        return []
    data = await _get_json(client, cited_by_url, {"per-page": limit})
    if not isinstance(data, dict):
        return []
    ids: list[str] = []
    for row in data.get("results") or []:
        if isinstance(row, dict) and isinstance(row.get("id"), str):
            ids.append(row["id"])
    return ids


def _to_candidate(
    work: dict,
    reason_types: set[str],
    library_id: Optional[str],
) -> Optional[RelatedPaperCandidate]:
    openalex_id = _short_openalex_id(work.get("id"))
    title = (work.get("display_name") or "").strip()
    if not openalex_id or not title:
        return None

    authorships = work.get("authorships") or []
    authors: list[str] = []
    for authorship in authorships:
        if not isinstance(authorship, dict):
            continue
        author = authorship.get("author") or {}
        name = author.get("display_name")
        if isinstance(name, str) and name:
            authors.append(name)

    doi = _normalize_doi((work.get("ids") or {}).get("doi"))
    arxiv_id = _extract_arxiv_id(work)
    abstract = _abstract_from_inverted_index(work.get("abstract_inverted_index"))
    cited_by_count = int(work.get("cited_by_count") or 0)
    reasons = [
        RelatedReason(
            type=rt,
            label={
                "semantic_related": "Semantic similarity",
                "cited_by_seed": "Cites this paper",
                "seed_cites": "Referenced by this paper",
                "title_neighbor": "Title neighbor",
            }.get(rt, rt),
        )
        for rt in sorted(reason_types)
    ]
    relevance_score = max((_reason_weight(rt) for rt in reason_types), default=0.0) + min(cited_by_count, 250) / 1000.0

    duplicates = dedup_service.find_duplicates(
        title=title,
        doi=doi,
        arxiv_id=arxiv_id,
        library_id=library_id,
    )
    already_exists = bool(duplicates)
    existing_id = duplicates[0].paper.id if duplicates else None

    return RelatedPaperCandidate(
        openalex_id=openalex_id,
        title=title,
        authors=authors,
        year=int(work.get("publication_year") or 0),
        venue=_venue_name(work),
        doi=doi,
        arxiv_id=arxiv_id,
        abstract=abstract,
        cited_by_count=cited_by_count,
        relevance_score=round(relevance_score, 4),
        reasons=reasons,
        already_exists=already_exists,
        existing_paper_id=existing_id,
        import_identifier=_best_import_identifier(doi, arxiv_id),
        openalex_url=f"https://openalex.org/{openalex_id}",
    )


async def find_related_papers(
    seed_paper: Paper,
    *,
    limit: int = 12,
    library_id: Optional[str] = None,
) -> RelatedPapersResponse:
    """
    Find related papers using OpenAlex citation links and semantic neighbors.
    """
    max_limit = max(1, min(limit, 30))
    async with httpx.AsyncClient(
        base_url=_OPENALEX_BASE,
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": _OPENALEX_UA},
    ) as client:
        try:
            seed_work = await _resolve_seed_work(client, seed_paper)
            if not seed_work:
                logger.info("OpenAlex seed work not found for paper %s", seed_paper.id)
                return RelatedPapersResponse(
                    seed_paper_id=seed_paper.id,
                    seed_openalex_id=None,
                    candidates=[],
                    total_candidates=0,
                )

            seed_openalex_id = _short_openalex_id(seed_work.get("id"))
            reason_map: dict[str, set[str]] = defaultdict(set)

            for wid in seed_work.get("related_works") or []:
                short = _short_openalex_id(wid)
                if short:
                    reason_map[short].add("semantic_related")

            for wid in seed_work.get("referenced_works") or []:
                short = _short_openalex_id(wid)
                if short:
                    reason_map[short].add("seed_cites")

            cited_by_ids = await _fetch_cited_by_ids(client, seed_work, max_limit)
            for wid in cited_by_ids:
                short = _short_openalex_id(wid)
                if short:
                    reason_map[short].add("cited_by_seed")

            if seed_openalex_id and seed_openalex_id in reason_map:
                reason_map.pop(seed_openalex_id, None)

            candidate_ids = list(reason_map.keys())[: max_limit * 3]
            works = await _fetch_many_works(client, candidate_ids)

            # Fallback when graph/similarity links are sparse for a seed work.
            if len(works) < max_limit:
                neighbors = await _fetch_title_neighbors(client, seed_paper.title, max_limit * 2)
                seed_short_id = _short_openalex_id(seed_work.get("id"))
                for work in neighbors:
                    short = _short_openalex_id(work.get("id"))
                    if not short or (seed_short_id and short == seed_short_id):
                        continue
                    if short not in reason_map:
                        reason_map[short].add("title_neighbor")
                        works.append(work)
                    if len(works) >= max_limit * 3:
                        break

            candidates: list[RelatedPaperCandidate] = []
            for work in works:
                short = _short_openalex_id(work.get("id"))
                if not short:
                    continue
                candidate = _to_candidate(work, reason_map.get(short, set()), library_id)
                if candidate:
                    candidates.append(candidate)

            candidates.sort(
                key=lambda c: (
                    c.already_exists,
                    -(c.relevance_score or 0.0),
                    -c.cited_by_count,
                )
            )
            candidates = candidates[:max_limit]
            return RelatedPapersResponse(
                seed_paper_id=seed_paper.id,
                seed_openalex_id=seed_openalex_id,
                candidates=candidates,
                total_candidates=len(candidates),
            )
        except httpx.HTTPError:
            logger.exception("OpenAlex request failed for paper %s", seed_paper.id)
            return RelatedPapersResponse(
                seed_paper_id=seed_paper.id,
                seed_openalex_id=None,
                candidates=[],
                total_candidates=0,
            )
