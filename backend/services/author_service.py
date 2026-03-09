import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.author import (
    Author,
    AuthorCreate,
    AuthorSearchResult,
    AuthorUpdate,
    PaperAuthor,
)
from models.paper import Paper
from services.db import get_client

logger = logging.getLogger(__name__)

_AUTHORS_TABLE = "authors"
_PAPER_AUTHORS_TABLE = "paper_authors"


def normalize_author_name(name: str) -> str:
    """Normalize an author name for matching: lowercase, strip punctuation, collapse whitespace,
    canonicalize 'Last, First' → sorted tokens 'first last'."""
    n = name.lower().strip()
    # Handle "Last, First" format → "first last"
    if "," in n:
        parts = [p.strip() for p in n.split(",", 1)]
        if len(parts) == 2 and parts[0] and parts[1]:
            n = f"{parts[1]} {parts[0]}"
    n = re.sub(r"[^a-z0-9\s]", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    tokens = sorted(n.split())
    return " ".join(tokens)


def _get_paper_count(author_id: str) -> int:
    result = (
        get_client()
        .table(_PAPER_AUTHORS_TABLE)
        .select("id", count="exact")
        .eq("author_id", author_id)
        .execute()
    )
    return result.count or 0


def _author_with_count(row: dict) -> Author:
    author = Author.model_validate(row)
    author = author.model_copy(update={"paper_count": _get_paper_count(author.id)})
    return author


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def list_authors(
    search: Optional[str] = None,
    limit: int = 50,
) -> list[Author]:
    query = get_client().table(_AUTHORS_TABLE).select("*")
    if search:
        query = query.ilike("name_normalized", f"%{normalize_author_name(search)}%")
    query = query.limit(limit)
    result = query.execute()

    # Batch count paper_authors
    author_ids = [r["id"] for r in result.data]
    counts: dict[str, int] = {}
    if author_ids:
        pa_result = get_client().table(_PAPER_AUTHORS_TABLE).select("author_id").execute()
        for row in pa_result.data:
            aid = row["author_id"]
            counts[aid] = counts.get(aid, 0) + 1

    authors = []
    for r in result.data:
        a = Author.model_validate(r)
        a = a.model_copy(update={"paper_count": counts.get(a.id, 0)})
        authors.append(a)
    return authors


def get_author(author_id: str) -> Optional[Author]:
    result = (
        get_client()
        .table(_AUTHORS_TABLE)
        .select("*")
        .eq("id", author_id)
        .execute()
    )
    if not result.data:
        return None
    return _author_with_count(result.data[0])


def create_author(data: AuthorCreate) -> Author:
    now = datetime.now(timezone.utc).isoformat()
    author_id = f"auth_{uuid.uuid4().hex[:8]}"
    name_normalized = normalize_author_name(data.name)
    row = {
        "id": author_id,
        "name": data.name,
        "name_normalized": name_normalized,
        "orcid": data.orcid,
        "google_scholar_url": data.google_scholar_url,
        "github_username": data.github_username,
        "openreview_url": data.openreview_url,
        "website_url": data.website_url,
        "emails": data.emails,
        "affiliations": [a.model_dump(by_alias=False) for a in data.affiliations],
        "created_at": now,
    }
    get_client().table(_AUTHORS_TABLE).insert(row).execute()
    logger.info("Created author %s: %s", author_id, data.name)
    return get_author(author_id)


def update_author(author_id: str, data: AuthorUpdate) -> Optional[Author]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_author(author_id)
    if get_author(author_id) is None:
        return None
    # Recompute name_normalized if name changes
    if "name" in updates:
        updates["name_normalized"] = normalize_author_name(updates["name"])
    # Serialize affiliations
    if "affiliations" in updates and updates["affiliations"] is not None:
        updates["affiliations"] = [
            a.model_dump(by_alias=False) if hasattr(a, "model_dump") else a
            for a in updates["affiliations"]
        ]
    get_client().table(_AUTHORS_TABLE).update(updates).eq("id", author_id).execute()
    logger.info("Updated author %s: %s", author_id, list(updates.keys()))
    return get_author(author_id)


def delete_author(author_id: str) -> bool:
    if get_author(author_id) is None:
        return False
    get_client().table(_AUTHORS_TABLE).delete().eq("id", author_id).execute()
    logger.info("Deleted author %s", author_id)
    return True


# ---------------------------------------------------------------------------
# Search & Match
# ---------------------------------------------------------------------------


def search_authors(query: str, limit: int = 10) -> list[AuthorSearchResult]:
    norm = normalize_author_name(query)
    result = (
        get_client()
        .table(_AUTHORS_TABLE)
        .select("*")
        .ilike("name_normalized", f"%{norm}%")
        .limit(limit)
        .execute()
    )

    # Get paper counts
    author_ids = [r["id"] for r in result.data]
    counts: dict[str, int] = {}
    if author_ids:
        pa_result = get_client().table(_PAPER_AUTHORS_TABLE).select("author_id").execute()
        for row in pa_result.data:
            aid = row["author_id"]
            counts[aid] = counts.get(aid, 0) + 1

    results = []
    for r in result.data:
        affiliations = r.get("affiliations") or []
        current = None
        if affiliations:
            # Most recent affiliation without end_date, or last one
            active = [a for a in affiliations if not a.get("end_date")]
            current = (active[-1] if active else affiliations[-1]).get("institution")

        results.append(
            AuthorSearchResult(
                id=r["id"],
                name=r["name"],
                current_affiliation=current,
                orcid=r.get("orcid"),
                paper_count=counts.get(r["id"], 0),
            )
        )
    return results


def find_matching_authors(name: str) -> list[dict]:
    """Multi-tier matching: exact normalized → token-set overlap → last-name + first-initial.
    Returns list of {author: Author, confidence: str}."""
    norm = normalize_author_name(name)
    tokens = set(norm.split())
    if not tokens:
        return []

    all_authors = get_client().table(_AUTHORS_TABLE).select("*").execute()
    candidates = []
    seen = set()

    for r in all_authors.data:
        a_norm = r["name_normalized"]
        aid = r["id"]

        # 1. Exact normalized match
        if a_norm == norm:
            if aid not in seen:
                candidates.append({"author": Author.model_validate(r), "confidence": "exact"})
                seen.add(aid)
            continue

        # 2. Token-set overlap (all tokens of shorter name in longer)
        a_tokens = set(a_norm.split())
        shorter, longer = (tokens, a_tokens) if len(tokens) <= len(a_tokens) else (a_tokens, tokens)
        if shorter and shorter.issubset(longer):
            if aid not in seen:
                candidates.append({"author": Author.model_validate(r), "confidence": "likely"})
                seen.add(aid)
            continue

        # 3. Last-name + first-initial match
        name_parts = norm.split()
        a_parts = a_norm.split()
        if name_parts and a_parts:
            # Check if they share a last name and first initial
            if (
                name_parts[-1] == a_parts[-1]
                and name_parts[0][:1] == a_parts[0][:1]
            ):
                if aid not in seen:
                    candidates.append({"author": Author.model_validate(r), "confidence": "possible"})
                    seen.add(aid)

    return candidates


# ---------------------------------------------------------------------------
# Linking
# ---------------------------------------------------------------------------


def link_paper_author(
    paper_id: str,
    author_id: str,
    position: int = 0,
    raw_name: str = "",
) -> PaperAuthor:
    now = datetime.now(timezone.utc).isoformat()
    link_id = f"pa_{uuid.uuid4().hex[:8]}"
    row = {
        "id": link_id,
        "paper_id": paper_id,
        "author_id": author_id,
        "position": position,
        "raw_name": raw_name,
        "created_at": now,
    }
    get_client().table(_PAPER_AUTHORS_TABLE).insert(row).execute()
    logger.info("Linked paper %s → author %s", paper_id, author_id)
    return PaperAuthor.model_validate(row)


def unlink_paper_author(paper_id: str, author_id: str) -> bool:
    result = (
        get_client()
        .table(_PAPER_AUTHORS_TABLE)
        .select("id")
        .eq("paper_id", paper_id)
        .eq("author_id", author_id)
        .execute()
    )
    if not result.data:
        return False
    get_client().table(_PAPER_AUTHORS_TABLE).delete().eq("paper_id", paper_id).eq(
        "author_id", author_id
    ).execute()
    logger.info("Unlinked paper %s → author %s", paper_id, author_id)
    return True


def get_paper_author_links(paper_id: str) -> list[dict]:
    """Get all author links for a paper, with Author data joined."""
    result = (
        get_client()
        .table(_PAPER_AUTHORS_TABLE)
        .select("*")
        .eq("paper_id", paper_id)
        .order("position")
        .execute()
    )
    links = []
    for row in result.data:
        pa = PaperAuthor.model_validate(row)
        author = get_author(row["author_id"])
        links.append({
            "link": pa,
            "author": author,
        })
    return links


def get_author_papers(author_id: str) -> list[Paper]:
    result = (
        get_client()
        .table(_PAPER_AUTHORS_TABLE)
        .select("paper_id")
        .eq("author_id", author_id)
        .execute()
    )
    paper_ids = [r["paper_id"] for r in result.data]
    if not paper_ids:
        return []

    from services import paper_service

    papers = []
    for pid in paper_ids:
        p = paper_service.get_paper(pid)
        if p:
            papers.append(p)
    return papers


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


def get_top_authors_for_papers(
    paper_ids: list[str],
    limit: int = 10,
) -> list[dict]:
    """Count author occurrences in papers.authors string arrays, enriched with author records where linked."""
    from services import paper_service

    # Count from string arrays
    name_counts: dict[str, int] = {}
    for pid in paper_ids:
        p = paper_service.get_paper(pid)
        if p:
            for author_name in p.authors:
                name_counts[author_name] = name_counts.get(author_name, 0) + 1

    # Sort by count descending
    sorted_names = sorted(name_counts.items(), key=lambda x: -x[1])[:limit]

    # Try to find linked author records
    result = []
    for name, count in sorted_names:
        matches = find_matching_authors(name)
        author = matches[0]["author"] if matches and matches[0]["confidence"] == "exact" else None
        result.append({
            "name": name,
            "count": count,
            "author": author.model_dump(by_alias=True) if author else None,
        })

    return result
