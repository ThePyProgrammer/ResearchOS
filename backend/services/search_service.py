"""
Lexical and semantic search over the paper library.

Lexical  — weighted keyword matching across title, authors, tags, abstract, venue.
Semantic — OpenAI text-embedding-3-small cosine similarity; embeddings cached in
           data/embeddings.json.  Falls back to lexical when OPENAI_API_KEY is
           absent or the API call fails.
"""

import logging
import math
import os
from typing import Optional

from agents.llm import get_model

from models.paper import Paper
from services.storage import DATA_DIR, load_json, save_json

logger = logging.getLogger(__name__)

_EMBED_FILE = "embeddings.json"


# ---------------------------------------------------------------------------
# Embedding cache
# ---------------------------------------------------------------------------

def _load_embeddings() -> dict[str, list[float]]:
    path = DATA_DIR / _EMBED_FILE
    if not path.exists():
        return {}
    try:
        return load_json(_EMBED_FILE)
    except Exception:
        return {}


def _save_embeddings(embeddings: dict[str, list[float]]) -> None:
    save_json(_EMBED_FILE, embeddings)


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


def _paper_embed_text(paper: Paper) -> str:
    """Concatenate the most informative fields for embedding."""
    parts = [paper.title]
    if paper.authors:
        parts.append(", ".join(paper.authors[:4]))
    parts.append(f"{paper.venue} {paper.year}")
    if paper.tags:
        parts.append(" ".join(paper.tags))
    if paper.abstract:
        parts.append(paper.abstract[:600])
    return ". ".join(parts)


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
# Lexical search
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
                # bonus for exact word boundary match
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


# ---------------------------------------------------------------------------
# Semantic search
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

    # Generate + cache embeddings for papers that don't have one yet
    updated = False
    for paper in papers:
        if paper.id not in embeddings:
            emb = await _embed(_paper_embed_text(paper))
            if emb:
                embeddings[paper.id] = emb
                updated = True

    if updated:
        _save_embeddings(embeddings)

    results: list[tuple[Paper, float]] = []
    for paper in papers:
        if paper.id in embeddings:
            score = _cosine(query_emb, embeddings[paper.id])
            results.append((paper, score))
        else:
            results.append((paper, 0.0))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:limit]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def search(
    query: str,
    mode: str = "lexical",
    limit: int = 10,
) -> list[tuple[Paper, float]]:
    from services.paper_service import list_papers
    papers = list_papers()

    if not query.strip():
        return [(p, 1.0) for p in papers[:limit]]

    if mode == "semantic":
        return await semantic_search(query, papers, limit)
    return lexical_search(query, papers, limit)


async def index_paper(paper: Paper) -> None:
    """Generate and cache the embedding for a single paper (background task)."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return
    embeddings = _load_embeddings()
    if paper.id in embeddings:
        return
    emb = await _embed(_paper_embed_text(paper))
    if emb:
        embeddings[paper.id] = emb
        _save_embeddings(embeddings)
        logger.info("Indexed embedding for paper %s", paper.id)
