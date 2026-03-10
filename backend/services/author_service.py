import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.author import (
    Author,
    AuthorCreate,
    AuthorLibrary,
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


def _get_author_libraries(author_id: str) -> list[AuthorLibrary]:
    """Get distinct libraries that contain papers linked to this author."""
    pa_result = (
        get_client()
        .table(_PAPER_AUTHORS_TABLE)
        .select("paper_id")
        .eq("author_id", author_id)
        .execute()
    )
    paper_ids = [r["paper_id"] for r in pa_result.data]
    if not paper_ids:
        return []

    # Fetch library_id for each linked paper
    lib_ids: set[str] = set()
    papers_result = get_client().table("papers").select("id,library_id").execute()
    paper_lib_map = {r["id"]: r.get("library_id") for r in papers_result.data}
    for pid in paper_ids:
        lid = paper_lib_map.get(pid)
        if lid:
            lib_ids.add(lid)

    if not lib_ids:
        return []

    libs_result = get_client().table("libraries").select("id,name").execute()
    lib_name_map = {r["id"]: r["name"] for r in libs_result.data}
    return [
        AuthorLibrary(id=lid, name=lib_name_map.get(lid, lid))
        for lid in sorted(lib_ids)
        if lid in lib_name_map
    ]


def _get_paper_count(author_id: str) -> int:
    result = (
        get_client()
        .table(_PAPER_AUTHORS_TABLE)
        .select("id", count="exact")
        .eq("author_id", author_id)
        .execute()
    )
    return result.count or 0


def _author_with_enrichment(row: dict) -> Author:
    author = Author.model_validate(row)
    author = author.model_copy(update={
        "paper_count": _get_paper_count(author.id),
        "libraries": _get_author_libraries(author.id),
    })
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

    # Batch count paper_authors and compute libraries
    author_ids = [r["id"] for r in result.data]
    counts: dict[str, int] = {}
    author_paper_ids: dict[str, list[str]] = {}
    if author_ids:
        pa_result = get_client().table(_PAPER_AUTHORS_TABLE).select("author_id,paper_id").execute()
        for row in pa_result.data:
            aid = row["author_id"]
            counts[aid] = counts.get(aid, 0) + 1
            author_paper_ids.setdefault(aid, []).append(row["paper_id"])

    # Build paper→library and library→name maps
    paper_lib: dict[str, str | None] = {}
    lib_map: dict[str, str] = {}
    if author_paper_ids:
        papers_result = get_client().table("papers").select("id,library_id").execute()
        paper_lib = {r["id"]: r.get("library_id") for r in papers_result.data}

        all_lib_ids = {lid for lid in paper_lib.values() if lid}
        if all_lib_ids:
            libs_result = get_client().table("libraries").select("id,name").execute()
            lib_map = {r["id"]: r["name"] for r in libs_result.data}

    authors = []
    for r in result.data:
        a = Author.model_validate(r)
        # Compute libraries for this author
        libs: list[AuthorLibrary] = []
        seen_libs: set[str] = set()
        for pid in author_paper_ids.get(a.id, []):
            lid = paper_lib.get(pid)
            if lid and lid not in seen_libs and lid in lib_map:
                seen_libs.add(lid)
                libs.append(AuthorLibrary(id=lid, name=lib_map[lid]))
        a = a.model_copy(update={
            "paper_count": counts.get(a.id, 0),
            "libraries": sorted(libs, key=lambda x: x.id),
        })
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
    return _author_with_enrichment(result.data[0])


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


def find_potential_papers(author_id: str) -> list[dict]:
    """Find papers not yet linked whose authors string array contains a name
    that fuzzy-matches this author. Returns list of {paper, raw_name, confidence}."""
    author = get_author(author_id)
    if not author:
        return []

    norm = normalize_author_name(author.name)
    tokens = set(norm.split())
    if not tokens:
        return []

    # Get already-linked paper IDs
    linked = (
        get_client()
        .table(_PAPER_AUTHORS_TABLE)
        .select("paper_id")
        .eq("author_id", author_id)
        .execute()
    )
    linked_ids = {r["paper_id"] for r in linked.data}

    # Scan all papers
    all_papers = get_client().table("papers").select("*").execute()
    results = []

    for row in all_papers.data:
        if row["id"] in linked_ids:
            continue
        author_names = row.get("authors") or []
        for raw_name in author_names:
            raw_norm = normalize_author_name(raw_name)
            raw_tokens = set(raw_norm.split())
            if not raw_tokens:
                continue

            confidence = None
            if raw_norm == norm:
                confidence = "exact"
            else:
                shorter, longer = (tokens, raw_tokens) if len(tokens) <= len(raw_tokens) else (raw_tokens, tokens)
                if shorter and shorter.issubset(longer):
                    confidence = "likely"
                else:
                    n_parts = norm.split()
                    r_parts = raw_norm.split()
                    if (
                        n_parts and r_parts
                        and n_parts[-1] == r_parts[-1]
                        and n_parts[0][:1] == r_parts[0][:1]
                    ):
                        confidence = "possible"

            if confidence:
                p = Paper.model_validate(row)
                results.append({
                    "paper": p,
                    "raw_name": raw_name,
                    "confidence": confidence,
                })
                break  # one match per paper is enough

    order = {"exact": 0, "likely": 1, "possible": 2}
    results.sort(key=lambda x: order.get(x["confidence"], 9))
    return results
