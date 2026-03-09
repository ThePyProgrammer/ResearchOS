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
_ZENODO_URL_RE = re.compile(r"zenodo\.org/records?/(\d+)")


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
# OpenReview → API v2 with v1 fallback
# ---------------------------------------------------------------------------

def _parse_openreview_note(note: dict, note_id: str) -> dict:
    """Parse an OpenReview note (v1 or v2 format) into a paper metadata dict."""
    from datetime import datetime, timezone

    content = note.get("content", {})

    # Detect API version: v2 wraps values in {"value": ...}, v1 uses bare values
    sample = content.get("title")
    is_v2 = isinstance(sample, dict) and "value" in sample

    def val(key: str, default=""):
        v = content.get(key, default)
        if is_v2 and isinstance(v, dict):
            return v.get("value", default)
        return v if v is not None else default

    title = val("title")
    if not title:
        raise ValueError(f"OpenReview returned no title for note '{note_id}'.")

    # Authors
    raw_authors = content.get("authors", [] if not is_v2 else {})
    if is_v2 and isinstance(raw_authors, dict):
        authors_list = raw_authors.get("value", [])
    elif isinstance(raw_authors, list):
        authors_list = raw_authors
    else:
        authors_list = []
    authors = [a for a in authors_list if isinstance(a, str)]

    # Abstract
    abstract = val("abstract", "")

    # Venue
    venue = val("venue", "") or val("venueid", "") or "OpenReview"

    # Date — use pdate (publication timestamp ms) or cdate (creation timestamp ms)
    year = 0
    published_date = None
    for ts_key in ("pdate", "cdate", "tcdate"):
        ts = note.get(ts_key)
        if ts and isinstance(ts, (int, float)):
            dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
            year = dt.year
            published_date = dt.strftime("%Y-%m-%d")
            break

    # PDF URL
    pdf_value = val("pdf", "")
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


async def _fetch_openreview(note_id: str) -> dict:
    """Resolve an OpenReview note ID, trying API v2 first then falling back to v1."""
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        # Try API v2 first
        resp = await client.get(f"https://api2.openreview.net/notes?id={note_id}")
        if resp.status_code == 200:
            data = resp.json()
            notes = data.get("notes", [])
            if notes:
                return _parse_openreview_note(notes[0], note_id)

        # Fall back to API v1 for older papers
        resp = await client.get(f"https://api.openreview.net/notes?id={note_id}")
        if resp.status_code == 200:
            data = resp.json()
            notes = data.get("notes", [])
            if notes:
                return _parse_openreview_note(notes[0], note_id)

    raise ValueError(f"OpenReview note '{note_id}' not found on v2 or v1 API.")


# ---------------------------------------------------------------------------
# Zenodo → REST API
# ---------------------------------------------------------------------------

async def _fetch_zenodo(record_id: str) -> dict:
    """Resolve a Zenodo record ID to paper metadata via the Zenodo REST API."""
    api_url = f"https://zenodo.org/api/records/{record_id}"

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.get(api_url)
        if resp.status_code == 404:
            raise ValueError(f"Zenodo record '{record_id}' not found.")
        resp.raise_for_status()
        data = resp.json()

    metadata = data.get("metadata", {})

    title = (metadata.get("title") or "").strip()
    if not title:
        raise ValueError(f"Zenodo returned no title for record '{record_id}'.")

    # Authors
    creators = metadata.get("creators") or []
    authors = [c.get("name", "") for c in creators if c.get("name")]

    # Abstract (may contain HTML)
    raw_abstract = (metadata.get("description") or "").strip()
    abstract = re.sub(r"<[^>]+>", " ", raw_abstract).strip()
    abstract = re.sub(r"\s{2,}", " ", abstract)

    # Date
    year = 0
    published_date = None
    pub_date_str = metadata.get("publication_date", "")
    if pub_date_str:
        published_date = pub_date_str[:10]  # YYYY-MM-DD
        try:
            year = int(pub_date_str[:4])
        except (ValueError, TypeError):
            pass

    # DOI
    doi = metadata.get("doi")

    # Venue — use journal title if available, otherwise resource type
    journal = metadata.get("journal") or {}
    venue = journal.get("title") or ""
    if not venue:
        resource = metadata.get("resource_type") or {}
        venue = resource.get("title") or "Zenodo"

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "published_date": published_date,
        "venue": venue,
        "doi": doi or None,
        "arxiv_id": None,
        "abstract": abstract[:2000] if abstract else None,
        "pdf_url": None,
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

    # 2c. Delegate Zenodo URLs immediately
    m = _ZENODO_URL_RE.search(url)
    if m:
        return await _fetch_zenodo(m.group(1))

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


# ---------------------------------------------------------------------------
# GitHub repo import
# ---------------------------------------------------------------------------

_GITHUB_REPO_RE = re.compile(
    r"github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$"
)

_GITHUB_HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "ResearchOS/0.1",
    "X-GitHub-Api-Version": "2022-11-28",
}


def _parse_citation_cff(text: str) -> dict:
    """Parse a CITATION.cff YAML file and return citation fields."""
    try:
        import yaml  # pyyaml
        data = yaml.safe_load(text)
        if not isinstance(data, dict):
            return {}

        # Build author name list
        authors: list[str] = []
        for a in data.get("authors", []):
            if not isinstance(a, dict):
                continue
            given = a.get("given-names", "").strip()
            family = a.get("family-names", "").strip()
            name = a.get("name", "").strip()
            if given or family:
                authors.append(f"{given} {family}".strip())
            elif name:
                authors.append(name)

        # DOI from identifiers list
        doi: Optional[str] = None
        for ident in data.get("identifiers", []):
            if isinstance(ident, dict) and ident.get("type") == "doi":
                doi = str(ident["value"]).strip() or None
                break

        version = data.get("version")
        date_released = data.get("date-released")

        return {
            "title": data.get("title"),
            "abstract": data.get("abstract"),
            "version": str(version).strip() if version is not None else None,
            "date_released": str(date_released).strip() if date_released is not None else None,
            "doi": doi,
            "authors": authors,
        }
    except Exception:
        logger.debug("Failed to parse CITATION.cff", exc_info=True)
        return {}


async def resolve_github_repo(url: str) -> dict:
    """
    Fetch a GitHub repository's metadata and optional CITATION.cff data.

    Returns a dict suitable for GitHubRepoCreate with keys:
    title, url, owner, repo_name, description, abstract, stars,
    language, topics, authors, published_date, version, doi, license.
    Raises ValueError with a user-facing message on failure.
    """
    m = _GITHUB_REPO_RE.search(url)
    if not m:
        raise ValueError("Not a valid GitHub repository URL")
    owner, repo_name = m.group(1), m.group(2)

    api_url = f"https://api.github.com/repos/{owner}/{repo_name}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(api_url, headers=_GITHUB_HEADERS)
        if resp.status_code == 404:
            raise ValueError(f"GitHub repository not found: {owner}/{repo_name}")
        if resp.status_code == 403:
            raise ValueError("GitHub API rate limit reached. Try again later.")
        resp.raise_for_status()
        repo_data = resp.json()

    default_branch = repo_data.get("default_branch", "main")

    # Try to fetch CITATION.cff from the default branch
    citation: dict = {}
    cff_url = f"https://raw.githubusercontent.com/{owner}/{repo_name}/{default_branch}/CITATION.cff"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            cff_resp = await client.get(cff_url, headers={"User-Agent": "ResearchOS/0.1"})
            if cff_resp.status_code == 200:
                citation = _parse_citation_cff(cff_resp.text)
                logger.info("Found CITATION.cff for %s/%s", owner, repo_name)
    except Exception:
        logger.debug("Could not fetch CITATION.cff for %s/%s", owner, repo_name, exc_info=True)

    title = citation.get("title") or repo_data.get("name") or f"{owner}/{repo_name}"
    authors = citation.get("authors") or []
    published_date = citation.get("date_released") or (repo_data.get("created_at", "")[:10] or None)
    license_info = repo_data.get("license")
    license_id = license_info.get("spdx_id") if isinstance(license_info, dict) else None

    return {
        "title": title,
        "url": f"https://github.com/{owner}/{repo_name}",
        "owner": owner,
        "repo_name": repo_name,
        "description": repo_data.get("description"),
        "abstract": citation.get("abstract"),
        "stars": repo_data.get("stargazers_count"),
        "language": repo_data.get("language"),
        "topics": repo_data.get("topics") or [],
        "authors": authors,
        "published_date": published_date,
        "version": citation.get("version"),
        "doi": citation.get("doi"),
        "license": license_id,
    }
