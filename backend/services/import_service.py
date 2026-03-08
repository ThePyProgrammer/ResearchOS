"""
Paper import service: resolves metadata from a DOI, arXiv ID, or URL.

Resolution strategy (mirrors Zotero's identifier lookup):
  DOI   → Crossref Works API (polite pool, User-Agent + mailto required)
  arXiv → arXiv Atom API  (export.arxiv.org/api/query?id_list=...)
  URL   → 1. Detect embedded arXiv URL / doi.org link → delegate above
           2. Fetch the page, extract citation_* / DC.* / OpenGraph meta tags
           3. If a DOI is found in the meta tags, re-delegate to Crossref
           4. Fall back to <title> element as minimal entry
"""

import logging
import re
import xml.etree.ElementTree as ET
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Crossref polite-pool credentials (required for stable rate limits)
_CROSSREF_UA = "ResearchOS/0.1 (mailto:researchos@localhost)"

_ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom"}

# ---------------------------------------------------------------------------
# Identifier detection
# ---------------------------------------------------------------------------

_DOI_RE = re.compile(r"\b(10\.\d{4,9}/\S+)")
_ARXIV_BARE_RE = re.compile(r"^(\d{4}\.\d{4,5})(v\d+)?$")
_ARXIV_URL_RE = re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5}(?:v\d+)?)")
_OPENREVIEW_URL_RE = re.compile(r"openreview\.net/(?:forum|pdf)\?id=([A-Za-z0-9_-]+)")


def detect_type(identifier: str) -> tuple[str, str]:
    """
    Return (type, canonical_value).
    type is one of: "doi" | "arxiv" | "url".
    Raises ValueError if the identifier cannot be classified.
    """
    s = identifier.strip()

    # doi.org URL → bare DOI
    if "doi.org/" in s:
        doi = s.split("doi.org/", 1)[-1].split("?")[0].rstrip("/")
        return "doi", doi

    # arXiv URL → bare arXiv ID (version stripped)
    m = _ARXIV_URL_RE.search(s)
    if m:
        arxiv_id = m.group(1).rsplit("v", 1)[0]
        return "arxiv", arxiv_id

    # Bare DOI (starts with 10.)
    if s.startswith("10.") and "/" in s:
        return "doi", s

    # doi: prefix
    if s.lower().startswith("doi:"):
        return "doi", s[4:].strip()

    # Bare arXiv ID  e.g. "2303.01234" or "2303.01234v2"
    m = _ARXIV_BARE_RE.match(s)
    if m:
        return "arxiv", m.group(1)  # strip version suffix

    # Treat everything else that looks like a URL as a URL
    if s.startswith(("http://", "https://")):
        return "url", s

    raise ValueError(
        f"Cannot identify '{s}' as a DOI, arXiv ID, or URL. "
        "Supported: DOI (10.xxx/yyy), arXiv ID (2303.01234), or a full URL."
    )


# ---------------------------------------------------------------------------
# DOI → Crossref Works API
# ---------------------------------------------------------------------------

async def _fetch_doi(doi: str) -> dict:
    """Resolve a DOI to paper metadata via the Crossref Works API."""
    url = f"https://api.crossref.org/works/{doi}"
    async with httpx.AsyncClient(
        headers={"User-Agent": _CROSSREF_UA}, timeout=15.0
    ) as client:
        resp = await client.get(url)
        if resp.status_code == 404:
            raise ValueError(f"DOI '{doi}' not found in Crossref.")
        resp.raise_for_status()
        data = resp.json()

    msg = data.get("message", {})

    titles = msg.get("title") or []
    title = titles[0].strip() if titles else ""
    if not title:
        raise ValueError(f"Crossref returned no title for DOI '{doi}'.")

    # Authors: prefer "family, given" format
    authors: list[str] = []
    for a in msg.get("author") or []:
        family = (a.get("family") or "").strip()
        given = (a.get("given") or "").strip()
        if family and given:
            authors.append(f"{family}, {given}")
        elif family:
            authors.append(family)
        elif given:
            authors.append(given)

    # Publication date (prefer print over online)
    year = 0
    published_date = None
    for date_key in ("published", "published-print", "published-online"):
        parts = (msg.get(date_key) or {}).get("date-parts", [[]])
        if parts and parts[0]:
            try:
                dp = parts[0]
                year = int(dp[0])
                # Build YYYY-MM-DD from available parts
                published_date = str(dp[0]).zfill(4)
                if len(dp) > 1:
                    published_date += f"-{str(dp[1]).zfill(2)}"
                    if len(dp) > 2:
                        published_date += f"-{str(dp[2]).zfill(2)}"
                break
            except (ValueError, TypeError):
                pass

    # Venue
    container = msg.get("container-title") or []
    venue = container[0].strip() if container else (msg.get("publisher") or "Unknown").strip()

    # Abstract (Crossref includes JATS XML markup; strip tags)
    raw_abstract = (msg.get("abstract") or "").strip()
    abstract = re.sub(r"<[^>]+>", " ", raw_abstract).strip()
    abstract = re.sub(r"\s{2,}", " ", abstract)

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "published_date": published_date,
        "venue": venue,
        "doi": doi,
        "arxiv_id": None,
        "abstract": abstract[:2000] or None,
        "pdf_url": None,
    }


# ---------------------------------------------------------------------------
# arXiv ID → Atom API
# ---------------------------------------------------------------------------

async def _fetch_arxiv(arxiv_id: str) -> dict:
    """Resolve an arXiv ID to paper metadata via the Atom API."""
    canonical = arxiv_id.rsplit("v", 1)[0] if re.search(r"v\d+$", arxiv_id) else arxiv_id
    url = f"https://export.arxiv.org/api/query?id_list={canonical}"

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        xml_data = resp.content

    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as exc:
        raise ValueError(f"Failed to parse arXiv response for ID '{arxiv_id}'.") from exc

    entries = root.findall("atom:entry", _ARXIV_NS)
    if not entries:
        raise ValueError(f"arXiv ID '{arxiv_id}' not found.")

    entry = entries[0]

    title_el = entry.find("atom:title", _ARXIV_NS)
    title = re.sub(r"\s+", " ", (title_el.text or "").strip())
    if not title:
        raise ValueError(f"arXiv returned no title for ID '{arxiv_id}'.")

    summary_el = entry.find("atom:summary", _ARXIV_NS)
    abstract = re.sub(r"\s+", " ", (summary_el.text or "").strip())

    published_el = entry.find("atom:published", _ARXIV_NS)
    published = (published_el.text or "")[:10]
    year = int(published[:4]) if published and published[:4].isdigit() else 0
    published_date = published if published and published[:4].isdigit() else None

    authors: list[str] = []
    for author_el in entry.findall("atom:author", _ARXIV_NS):
        name_el = author_el.find("atom:name", _ARXIV_NS)
        if name_el is not None and name_el.text:
            authors.append(name_el.text.strip())

    # Find PDF link
    pdf_url: Optional[str] = None
    for link_el in entry.findall("atom:link", _ARXIV_NS):
        if link_el.get("type") == "application/pdf":
            pdf_url = link_el.get("href")
            break

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "published_date": published_date,
        "venue": "arXiv",
        "doi": None,
        "arxiv_id": canonical,
        "abstract": abstract[:2000] or None,
        "pdf_url": pdf_url,
    }


# ---------------------------------------------------------------------------
# OpenReview → API v2
# ---------------------------------------------------------------------------

async def _fetch_openreview(note_id: str) -> dict:
    """Resolve an OpenReview note ID to paper metadata via the OpenReview API v2."""
    api_url = f"https://api2.openreview.net/notes?id={note_id}"

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.get(api_url)
        if resp.status_code == 404:
            raise ValueError(f"OpenReview note '{note_id}' not found.")
        resp.raise_for_status()
        data = resp.json()

    notes = data.get("notes", [])
    if not notes:
        raise ValueError(f"OpenReview note '{note_id}' not found.")

    note = notes[0]
    content = note.get("content", {})

    # Helper: OpenReview v2 wraps values in {"value": ...}
    def val(key: str, default=""):
        v = content.get(key, {})
        return v.get("value", default) if isinstance(v, dict) else (v or default)

    title = val("title")
    if not title:
        raise ValueError(f"OpenReview returned no title for note '{note_id}'.")

    # Authors
    raw_authors = content.get("authors", {})
    authors_list = raw_authors.get("value", []) if isinstance(raw_authors, dict) else (raw_authors or [])
    authors = [a for a in authors_list if isinstance(a, str)]

    # Abstract
    abstract = val("abstract")

    # Venue
    venue = val("venue") or val("venueid") or "OpenReview"

    # Date — use pdate (publication timestamp ms) or cdate (creation timestamp ms)
    year = 0
    published_date = None
    for ts_key in ("pdate", "cdate", "tcdate"):
        ts = note.get(ts_key)
        if ts and isinstance(ts, (int, float)):
            from datetime import datetime, timezone
            dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
            year = dt.year
            published_date = dt.strftime("%Y-%m-%d")
            break

    # PDF URL
    pdf_value = val("pdf")
    pdf_url = None
    if pdf_value:
        if pdf_value.startswith("http"):
            pdf_url = pdf_value
        else:
            pdf_url = f"https://openreview.net{pdf_value}"

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "published_date": published_date,
        "venue": venue,
        "doi": None,
        "arxiv_id": None,
        "abstract": abstract[:2000] if abstract else None,
        "pdf_url": pdf_url,
    }


# ---------------------------------------------------------------------------
# URL → sniff then meta-tag extraction
# ---------------------------------------------------------------------------

# Match both attribute orders for <meta name="..." content="...">
_META_NC = re.compile(
    r"<meta\b[^>]*?\bname=[\"']([^\"']+)[\"'][^>]*?\bcontent=[\"']([^\"']*)[\"']",
    re.IGNORECASE,
)
_META_CN = re.compile(
    r"<meta\b[^>]*?\bcontent=[\"']([^\"']*)[\"'][^>]*?\bname=[\"']([^\"']+)[\"']",
    re.IGNORECASE,
)
_META_PC = re.compile(
    r"<meta\b[^>]*?\bproperty=[\"']([^\"']+)[\"'][^>]*?\bcontent=[\"']([^\"']*)[\"']",
    re.IGNORECASE,
)
_META_CP = re.compile(
    r"<meta\b[^>]*?\bcontent=[\"']([^\"']*)[\"'][^>]*?\bproperty=[\"']([^\"']+)[\"']",
    re.IGNORECASE,
)


def _collect_meta(html: str) -> dict[str, list[str]]:
    """Return a dict mapping lowercase meta key → list of values (preserving duplicates)."""
    result: dict[str, list[str]] = {}

    def _add(key: str, val: str) -> None:
        key = key.lower().strip()
        val = val.strip()
        if key and val:
            result.setdefault(key, []).append(val)

    for m in _META_NC.finditer(html):
        _add(m.group(1), m.group(2))
    for m in _META_CN.finditer(html):
        _add(m.group(2), m.group(1))
    for m in _META_PC.finditer(html):
        _add(m.group(1), m.group(2))
    for m in _META_CP.finditer(html):
        _add(m.group(2), m.group(1))

    return result


def _parse_meta(meta: dict[str, list[str]], url: str) -> dict:
    """Build a paper dict from collected meta values."""

    def first(*keys: str) -> str:
        for k in keys:
            vals = meta.get(k)
            if vals:
                return vals[0]
        return ""

    # Authors: citation_author can appear multiple times
    authors: list[str] = []
    for key in ("citation_author", "dc.creator", "author"):
        authors.extend(meta.get(key, []))
    # deduplicate preserving order
    seen: set[str] = set()
    authors = [a for a in authors if a not in seen and not seen.add(a)]  # type: ignore[func-returns-value]

    # Date / Year
    year = 0
    published_date = None
    date_str = first("citation_publication_date", "citation_date", "dc.date", "date")
    # Try to extract a full date (YYYY-MM-DD or YYYY/MM/DD)
    full_date_m = re.search(r"((?:19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})", date_str)
    if full_date_m:
        year = int(full_date_m.group(1))
        published_date = f"{full_date_m.group(1)}-{full_date_m.group(2).zfill(2)}-{full_date_m.group(3).zfill(2)}"
    else:
        ym = re.search(r"\b((?:19|20)\d{2})\b", date_str)
        if ym:
            year = int(ym.group(1))
            published_date = ym.group(1)

    title = first(
        "citation_title", "dc.title", "og:title", "twitter:title", "title"
    )
    venue = first(
        "citation_journal_title",
        "citation_conference_title",
        "og:site_name",
        "dc.publisher",
    )
    doi = first("citation_doi", "dc.identifier")
    if doi and not doi.startswith("10."):
        doi = ""  # reject non-DOI identifiers
    abstract = first("citation_abstract", "dc.description", "og:description", "description")
    pdf_url = first("citation_pdf_url")

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "published_date": published_date,
        "venue": venue,
        "doi": doi or None,
        "arxiv_id": None,
        "abstract": abstract[:2000] if abstract else None,
        "pdf_url": pdf_url or None,
    }


async def _fetch_url(url: str) -> dict:
    """Attempt to extract paper metadata from an arbitrary URL."""
    # 1. Delegate arXiv URLs immediately
    m = _ARXIV_URL_RE.search(url)
    if m:
        return await _fetch_arxiv(m.group(1))

    # 2. Delegate doi.org URLs immediately
    if "doi.org/" in url:
        doi = url.split("doi.org/", 1)[-1].split("?")[0].rstrip("/")
        return await _fetch_doi(doi)

    # 2b. Delegate OpenReview URLs immediately
    m = _OPENREVIEW_URL_RE.search(url)
    if m:
        return await _fetch_openreview(m.group(1))

    # 3. Fetch the page
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; ResearchOS/0.1; "
            "mailto:researchos@localhost)"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        async with httpx.AsyncClient(
            headers=headers, timeout=15.0, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except httpx.HTTPStatusError as exc:
        raise ValueError(
            f"Server returned {exc.response.status_code} for URL."
        ) from exc
    except Exception as exc:
        raise ValueError(f"Could not fetch URL: {exc}") from exc

    # 4. Check for arXiv or DOI embedded in the page content
    arxiv_m = _ARXIV_URL_RE.search(html)
    if arxiv_m:
        return await _fetch_arxiv(arxiv_m.group(1))

    doi_m = _DOI_RE.search(html)
    if doi_m:
        try:
            return await _fetch_doi(doi_m.group(1))
        except Exception:
            pass  # fall through to meta extraction

    # 5. Extract meta tags
    meta = _collect_meta(html)
    result = _parse_meta(meta, url)

    # If meta gave us a clean DOI, re-resolve via Crossref for full metadata
    if result.get("doi"):
        try:
            return await _fetch_doi(result["doi"])
        except Exception:
            pass

    # 6. Last resort: use <title> tag
    if not result.get("title"):
        title_m = re.search(
            r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL
        )
        result["title"] = (
            re.sub(r"\s+", " ", title_m.group(1)).strip()
            if title_m
            else url
        )

    if not result.get("title"):
        raise ValueError("Could not extract any paper metadata from that URL.")

    return result


# ---------------------------------------------------------------------------
# Website URL metadata extraction
# ---------------------------------------------------------------------------

async def resolve_url_as_website(url: str) -> dict:
    """
    Fetch a URL and extract website metadata for a non-academic page.
    Returns: title, description, authors, published_date.
    Raises ValueError if the URL looks like an academic paper or can't be fetched.
    """
    if _ARXIV_URL_RE.search(url) or "doi.org/" in url:
        raise ValueError("This URL looks like a paper. Use the Paper import instead.")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; ResearchOS/0.1; mailto:researchos@localhost)"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        async with httpx.AsyncClient(
            headers=headers, timeout=15.0, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except httpx.HTTPStatusError as exc:
        raise ValueError(
            f"Server returned {exc.response.status_code} for URL."
        ) from exc
    except Exception as exc:
        raise ValueError(f"Could not fetch URL: {exc}") from exc

    meta = _collect_meta(html)

    def first(*keys: str) -> str:
        for k in keys:
            vals = meta.get(k)
            if vals:
                return vals[0]
        return ""

    # Title
    title = first("og:title", "twitter:title", "citation_title", "dc.title")
    if not title:
        title_m = re.search(
            r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL
        )
        title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else url

    if not title:
        raise ValueError("Could not extract a title from that URL.")

    # Description
    description = first(
        "og:description", "twitter:description", "description", "dc.description"
    )

    # Authors (multiple citation_author tags possible)
    authors: list[str] = []
    for key in ("author", "article:author", "citation_author", "dc.creator"):
        authors.extend(meta.get(key, []))
    seen: set[str] = set()
    authors = [a for a in authors if not (a in seen or seen.add(a))]  # type: ignore[func-returns-value]

    # Published date
    raw_date = first(
        "article:published_time",
        "og:article:published_time",
        "citation_publication_date",
        "date",
        "dc.date",
    )
    published_date: Optional[str] = None
    if raw_date:
        date_m = re.search(r"(\d{4}-\d{2}-\d{2}|\d{4}/\d{2}/\d{2}|\d{4})", raw_date)
        if date_m:
            published_date = date_m.group(1).replace("/", "-")

    return {
        "title": title,
        "description": description[:2000] if description else None,
        "authors": authors,
        "published_date": published_date,
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def resolve_identifier(identifier: str) -> dict:
    """
    Resolve a DOI, arXiv ID, or URL to a paper metadata dict.

    Returns keys: title, authors, year, venue, doi, arxiv_id, abstract, pdf_url.
    Raises ValueError with a user-facing message on any lookup failure.
    """
    id_type, canonical = detect_type(identifier)
    logger.info("Importing paper: type=%s value=%s", id_type, canonical)

    if id_type == "doi":
        return await _fetch_doi(canonical)
    if id_type == "arxiv":
        return await _fetch_arxiv(canonical)
    return await _fetch_url(canonical)
