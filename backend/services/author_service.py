import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from postgrest.exceptions import APIError

from models.author import (
    Author,
    AuthorCreate,
    AuthorLibrary,
    AuthorLab,
    AuthorSearchResult,
    AuthorUpdate,
    PaperAuthor,
    PaperAuthorReference,
    TopAuthor,
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


def _read_related(table: str, columns: str, field: str, ids: list[str]) -> list[dict]:
    """Bound IN filters and page through results instead of trusting the DB row cap."""
    rows = []
    ids = list(dict.fromkeys(ids))
    for start in range(0, len(ids), 100):
        offset = 0
        while True:
            page = (get_client().table(table).select(columns)
                    .in_(field, ids[start:start + 100]).order("id")
                    .range(offset, offset + 499).execute().data)
            rows.extend(page)
            if len(page) < 500:
                break
            offset += len(page)
    return rows


def _read_author_labs(author_ids: list[str]) -> dict[str, list[AuthorLab]]:
    """Read both roles in bounded batches, merging a lab when an author has both."""
    by_author: dict[str, dict[str, AuthorLab]] = {}
    ids = list(dict.fromkeys(author_ids))
    for table, role in (("lab_members", "is_member"), ("lab_principal_investigators", "is_pi")):
        for start in range(0, len(ids), 100):
            offset = 0
            while True:
                try:
                    rows = (get_client().table(table).select("author_id,labs(id,name)")
                            .in_("author_id", ids[start:start + 100])
                            .order("author_id").order("lab_id")
                            .range(offset, offset + 499).execute().data)
                except APIError as exc:
                    if exc.code in ("PGRST205", "PGRST200", "42P01"):
                        logger.warning("Author lab associations unavailable; apply Labs migrations through 027_lab_details.sql")
                        raise HTTPException(503, detail="Author labs need the Labs migrations through 027_lab_details.sql. Apply them in Supabase and retry.") from exc
                    raise
                for row in rows:
                    if row.get("labs") is None:
                        continue
                    lab = AuthorLab.model_validate(row["labs"])
                    author_labs = by_author.setdefault(row["author_id"], {})
                    existing = author_labs.get(lab.id, lab)
                    author_labs[lab.id] = existing.model_copy(update={role: True})
                if len(rows) < 500:
                    break
                offset += len(rows)
    return {aid: sorted(labs.values(), key=lambda lab: (lab.name.casefold(), lab.id))
            for aid, labs in by_author.items()}


def _enrich_authors(authors: list[Author], *, include_labs: bool = False) -> list[Author]:
    # PostgREST joins links to papers; library_id has no foreign key to libraries.
    links = _read_related(
        _PAPER_AUTHORS_TABLE, "author_id,papers(library_id)",
        "author_id", [author.id for author in authors],
    )
    library_ids = list(dict.fromkeys(
        link["papers"]["library_id"] for link in links
        if (link.get("papers") or {}).get("library_id")
    ))
    by_library = {row["id"]: AuthorLibrary.model_validate(row) for row in _read_related(
        "libraries", "id,name", "id", library_ids,
    )}
    counts: dict[str, int] = {}
    libraries: dict[str, dict[str, AuthorLibrary]] = {}
    for link in links:
        aid = link["author_id"]
        counts[aid] = counts.get(aid, 0) + 1
        lib = by_library.get((link.get("papers") or {}).get("library_id"))
        if lib:
            libraries.setdefault(aid, {})[lib.id] = lib
    labs = _read_author_labs([author.id for author in authors]) if include_labs else {}
    return [author.model_copy(update={
        "labs": labs.get(author.id, []),
        "paper_count": counts.get(author.id, 0),
        "libraries": sorted(libraries.get(author.id, {}).values(), key=lambda lib: lib.id),
    }) for author in authors]


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
    result = query.order("name").order("id").limit(limit).execute()
    return _enrich_authors([Author.model_validate(row) for row in result.data], include_labs=True)


def get_author(author_id: str, *, enrich: bool = True) -> Optional[Author]:
    result = (
        get_client()
        .table(_AUTHORS_TABLE)
        .select("*")
        .eq("id", author_id)
        .execute()
    )
    if not result.data:
        return None
    author = Author.model_validate(result.data[0])
    return _enrich_authors([author], include_labs=True)[0] if enrich else author


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
    if get_author(author_id, enrich=False) is None:
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
    if get_author(author_id, enrich=False) is None:
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
        for row in _read_related(_PAPER_AUTHORS_TABLE, "author_id", "author_id", author_ids):
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


def get_paper_author_links(paper_id: str) -> list[PaperAuthorReference]:
    """Load links, author profiles, and enrichment in bounded batches."""
    links = [PaperAuthor.model_validate(row) for row in _read_related(
        _PAPER_AUTHORS_TABLE, "*", "paper_id", [paper_id],
    )]
    links.sort(key=lambda link: (link.position, link.id))
    authors = _enrich_authors([Author.model_validate(row) for row in _read_related(
        _AUTHORS_TABLE, "*", "id", [link.author_id for link in links],
    )])
    by_id = {author.id: author for author in authors}
    return [PaperAuthorReference(link=link, author=by_id.get(link.author_id)) for link in links]


def get_author_papers(author_id: str) -> list[Paper]:
    links = _read_related(_PAPER_AUTHORS_TABLE, "paper_id", "author_id", [author_id])
    paper_ids = list(dict.fromkeys(row["paper_id"] for row in links))
    papers = {row["id"]: Paper.model_validate(row) for row in _read_related(
        "papers", "*", "id", paper_ids,
    )}
    return [papers[pid] for pid in paper_ids if pid in papers]


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


def get_top_authors_for_papers(
    papers: list[Paper],
    limit: int = 10,
) -> list[TopAuthor]:
    """Count author occurrences in papers.authors string arrays, enriched with author records where linked."""
    # Count from string arrays
    name_counts: dict[str, int] = {}
    for paper in papers:
        for author_name in paper.authors:
            name_counts[author_name] = name_counts.get(author_name, 0) + 1

    # Sort by count descending
    sorted_names = sorted(name_counts.items(), key=lambda x: -x[1])[:limit]

    # Only exact matches are displayed here. Fetch those together instead of
    # scanning the entire authors table once per displayed name.
    names = list(dict.fromkeys(normalize_author_name(name) for name, _ in sorted_names))
    names = [name for name in names if name]
    authors: dict[str, Author] = {}
    for offset in range(0, len(names), 100):
        rows = get_client().table(_AUTHORS_TABLE).select("*").in_(
            "name_normalized", names[offset:offset + 100],
        ).execute()
        for row in rows.data:
            author = Author.model_validate(row)
            authors.setdefault(author.name_normalized, author)
    return [
        TopAuthor(name=name, count=count, author=authors.get(normalize_author_name(name)))
        for name, count in sorted_names
    ]


def find_potential_papers(author_id: str) -> list[dict]:
    """Find papers not yet linked whose authors string array contains a name
    that fuzzy-matches this author. Returns list of {paper, raw_name, confidence}."""
    author = get_author(author_id, enrich=False)
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
