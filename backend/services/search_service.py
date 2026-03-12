"""
Lexical and semantic search over the full library (papers, websites, GitHub repos).

Lexical  — weighted keyword matching per item type.
Semantic — OpenAI text-embedding-3-small cosine similarity; embeddings cached in
           data/embeddings.json.  Falls back to lexical when OPENAI_API_KEY is
           absent or the API call fails.

All three item types carry an `item_type` field ("paper" | "website" | "github_repo")
so consumers can route results without additional type checks.
"""

import logging
import math
import os
from typing import Optional, Union

from agents.llm import get_model

from models.github_repo import GitHubRepo
from models.paper import Paper
from models.website import Website
from services.storage import DATA_DIR, load_json, save_json

logger = logging.getLogger(__name__)

_EMBED_FILE = "embeddings.json"

AnyItem = Union[Paper, Website, GitHubRepo]


# ---------------------------------------------------------------------------
# Embedding cache
# ---------------------------------------------------------------------------

def _load_embeddings() -> dict[str, list[float]]:
    path = DATA_DIR / _EMBED_FILE
    if not path.exists():
        return {}
    try:
        raw = load_json(_EMBED_FILE)
        if not isinstance(raw, dict):
            return {}
        return raw  # type: ignore[return-value]
    except Exception:
        return {}


def _save_embeddings(embeddings: dict[str, list[float]]) -> None:
    save_json(_EMBED_FILE, embeddings)


def _embed_cache_key(item: AnyItem) -> str:
    """Return a globally unique cache key for any item type."""
    if isinstance(item, Website):
        return f"ws:{item.id}"
    if isinstance(item, GitHubRepo):
        return f"gh:{item.id}"
    return item.id  # Paper — backward-compatible; no prefix


# ---------------------------------------------------------------------------
# OpenAI embedding helper
# ---------------------------------------------------------------------------

async def _embed(text: str) -> Optional[list[float]]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        from agents.llm import get_async_openai_client
        client = get_async_openai_client()
        resp = await client.embeddings.create(model=get_model("embedding"), input=text[:8000])
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("Embedding call failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Per-type embed text helpers
# ---------------------------------------------------------------------------

def _paper_embed_text(paper: Paper) -> str:
    parts = [paper.title]
    if paper.authors:
        parts.append(", ".join(paper.authors[:4]))
    parts.append(f"{paper.venue} {paper.year}")
    if paper.tags:
        parts.append(" ".join(paper.tags))
    if paper.abstract:
        parts.append(paper.abstract[:600])
    return ". ".join(parts)


def _website_embed_text(website: Website) -> str:
    parts = [website.title, website.url]
    if website.authors:
        parts.append(", ".join(website.authors[:4]))
    if website.tags:
        parts.append(" ".join(website.tags))
    if website.description:
        parts.append(website.description[:600])
    return ". ".join(parts)


def _github_repo_embed_text(repo: GitHubRepo) -> str:
    parts = [repo.title, f"{repo.owner}/{repo.repo_name}"]
    if repo.topics:
        parts.append(" ".join(repo.topics))
    if repo.tags:
        parts.append(" ".join(repo.tags))
    if repo.language:
        parts.append(repo.language)
    if repo.abstract:
        parts.append(repo.abstract[:600])
    elif repo.description:
        parts.append(repo.description[:600])
    return ". ".join(parts)


def _item_embed_text(item: AnyItem) -> str:
    if isinstance(item, Website):
        return _website_embed_text(item)
    if isinstance(item, GitHubRepo):
        return _github_repo_embed_text(item)
    return _paper_embed_text(item)


# ---------------------------------------------------------------------------
# Cosine similarity
# ---------------------------------------------------------------------------

def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ---------------------------------------------------------------------------
# Lexical search — per item type
# ---------------------------------------------------------------------------

def lexical_search(
    query: str,
    papers: list[Paper],
    limit: int = 20,
) -> list[tuple[Paper, float]]:
    """Score papers by weighted keyword match. Returns (paper, score) desc."""
    terms = query.lower().split()
    if not terms:
        return [(p, 1.0) for p in papers[:limit]]

    results: list[tuple[Paper, float]] = []
    for paper in papers:
        title_l = paper.title.lower()
        abstract_l = (paper.abstract or "").lower()
        authors_l = " ".join(paper.authors).lower()
        tags_l = " ".join(paper.tags).lower()
        venue_l = paper.venue.lower()

        score = 0.0
        for term in terms:
            if term in title_l:
                score += 3.0
                if f" {term} " in f" {title_l} ":
                    score += 1.0
            if term in authors_l:
                score += 2.0
            if term in tags_l:
                score += 1.5
            if term in abstract_l:
                score += 1.0
            if term in venue_l:
                score += 0.5

        if score > 0:
            results.append((paper, score))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:limit]


def _lexical_search_websites(
    query: str,
    websites: list[Website],
    limit: int = 20,
) -> list[tuple[Website, float]]:
    terms = query.lower().split()
    if not terms:
        return [(w, 1.0) for w in websites[:limit]]

    results: list[tuple[Website, float]] = []
    for site in websites:
        title_l = site.title.lower()
        url_l = site.url.lower()
        authors_l = " ".join(site.authors).lower()
        tags_l = " ".join(site.tags).lower()
        desc_l = (site.description or "").lower()

        score = 0.0
        for term in terms:
            if term in title_l:
                score += 3.0
                if f" {term} " in f" {title_l} ":
                    score += 1.0
            if term in authors_l:
                score += 2.0
            if term in tags_l:
                score += 1.5
            if term in desc_l:
                score += 1.0
            if term in url_l:
                score += 0.5

        if score > 0:
            results.append((site, score))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:limit]


def _lexical_search_github_repos(
    query: str,
    repos: list[GitHubRepo],
    limit: int = 20,
) -> list[tuple[GitHubRepo, float]]:
    terms = query.lower().split()
    if not terms:
        return [(r, 1.0) for r in repos[:limit]]

    results: list[tuple[GitHubRepo, float]] = []
    for repo in repos:
        title_l = repo.title.lower()
        slug_l = f"{repo.owner}/{repo.repo_name}".lower()
        topics_l = " ".join(repo.topics).lower()
        tags_l = " ".join(repo.tags).lower()
        abstract_l = (repo.abstract or "").lower()
        desc_l = (repo.description or "").lower()
        lang_l = (repo.language or "").lower()

        score = 0.0
        for term in terms:
            if term in title_l:
                score += 3.0
                if f" {term} " in f" {title_l} ":
                    score += 1.0
            if term in slug_l:
                score += 2.5
            if term in topics_l:
                score += 2.0
            if term in tags_l:
                score += 1.5
            if term in abstract_l:
                score += 1.2
            if term in desc_l:
                score += 1.0
            if term in lang_l:
                score += 0.5

        if score > 0:
            results.append((repo, score))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:limit]


# ---------------------------------------------------------------------------
# Semantic search (all item types)
# ---------------------------------------------------------------------------

async def semantic_search(
    query: str,
    papers: list[Paper],
    limit: int = 10,
) -> list[tuple[Paper, float]]:
    """
    Embed query and rank papers by cosine similarity.
    Falls back to lexical_search when no API key is available.
    """
    query_emb = await _embed(query)
    if query_emb is None:
        logger.info("Semantic search: no embedding — falling back to lexical")
        return lexical_search(query, papers, limit)

    embeddings = _load_embeddings()
    updated = False
    for paper in papers:
        key = _embed_cache_key(paper)
        if key not in embeddings:
            emb = await _embed(_item_embed_text(paper))
            if emb:
                embeddings[key] = emb
                updated = True

    if updated:
        _save_embeddings(embeddings)

    results: list[tuple[Paper, float]] = []
    for paper in papers:
        key = _embed_cache_key(paper)
        score = _cosine(query_emb, embeddings[key]) if key in embeddings else 0.0
        results.append((paper, score))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:limit]


async def _semantic_search_all(
    query: str,
    items: list[AnyItem],
    limit: int = 10,
) -> list[tuple[AnyItem, float]]:
    """
    Embed query and rank any item type by cosine similarity.
    Falls back to per-type lexical search when no API key is available.
    """
    query_emb = await _embed(query)
    if query_emb is None:
        logger.info("Semantic search: no embedding — falling back to lexical for all types")
        # Partition and fall back
        papers = [i for i in items if isinstance(i, Paper)]
        websites = [i for i in items if isinstance(i, Website)]
        repos = [i for i in items if isinstance(i, GitHubRepo)]
        merged: list[tuple[AnyItem, float]] = []
        merged.extend(lexical_search(query, papers, limit))
        merged.extend(_lexical_search_websites(query, websites, limit))
        merged.extend(_lexical_search_github_repos(query, repos, limit))
        merged.sort(key=lambda x: x[1], reverse=True)
        return merged[:limit]

    embeddings = _load_embeddings()
    updated = False
    for item in items:
        key = _embed_cache_key(item)
        if key not in embeddings:
            emb = await _embed(_item_embed_text(item))
            if emb:
                embeddings[key] = emb
                updated = True

    if updated:
        _save_embeddings(embeddings)

    results: list[tuple[AnyItem, float]] = []
    for item in items:
        key = _embed_cache_key(item)
        score = _cosine(query_emb, embeddings[key]) if key in embeddings else 0.0
        results.append((item, score))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:limit]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def search(
    query: str,
    mode: str = "lexical",
    limit: int = 10,
    library_id: Optional[str] = None,
    types: Optional[list[str]] = None,
) -> list[tuple[AnyItem, float]]:
    """
    Search across papers, websites, and GitHub repos.

    Args:
        query:      Search query string.
        mode:       "lexical" or "semantic".
        limit:      Maximum number of results to return.
        library_id: Optional — filter to items belonging to this library.
        types:      Optional list of item types to include
                    (["paper", "website", "github_repo"]).
                    Defaults to all three.
    """
    from services.github_repo_service import list_github_repos
    from services.paper_service import list_papers
    from services.website_service import list_websites

    include_types = set(types) if types else {"paper", "website", "github_repo"}

    papers: list[Paper] = []
    websites: list[Website] = []
    repos: list[GitHubRepo] = []

    if "paper" in include_types:
        papers = list_papers(library_id=library_id)
    if "website" in include_types:
        websites = list_websites(library_id=library_id)
    if "github_repo" in include_types:
        repos = list_github_repos(library_id=library_id)

    if not query.strip():
        all_items: list[AnyItem] = [*papers, *websites, *repos]
        return [(item, 1.0) for item in all_items[:limit]]

    if mode == "semantic":
        all_items = [*papers, *websites, *repos]
        return await _semantic_search_all(query, all_items, limit)

    # Lexical: search each type then merge by score
    paper_results = lexical_search(query, papers, limit)
    website_results = _lexical_search_websites(query, websites, limit)
    repo_results = _lexical_search_github_repos(query, repos, limit)

    merged: list[tuple[AnyItem, float]] = [
        *paper_results,
        *website_results,
        *repo_results,
    ]
    merged.sort(key=lambda x: x[1], reverse=True)
    return merged[:limit]


async def index_paper(paper: Paper) -> None:
    """Generate and cache the embedding for a single paper (background task)."""
    await _index_item(paper)


async def index_website(website: Website) -> None:
    """Generate and cache the embedding for a single website (background task)."""
    await _index_item(website)


async def index_github_repo(repo: GitHubRepo) -> None:
    """Generate and cache the embedding for a single GitHub repo (background task)."""
    await _index_item(repo)


async def _index_item(item: AnyItem) -> None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return
    embeddings = _load_embeddings()
    key = _embed_cache_key(item)
    if key in embeddings:
        return
    emb = await _embed(_item_embed_text(item))
    if emb:
        embeddings[key] = emb
        _save_embeddings(embeddings)
        logger.info("Indexed embedding for %s %s", item.item_type, item.id)
