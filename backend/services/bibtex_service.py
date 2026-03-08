"""
BibTeX import service: parses .bib files and maps entries to PaperCreate models.

Handles common BibTeX messiness:
  - LaTeX escapes in titles and author names
  - Multiple author formats ("Last, First" vs "First Last" vs "First Last and ...")
  - Missing or malformed fields (year, venue, abstract)
  - Entries with no title (skipped)
"""

import logging
import re
from typing import Optional

import bibtexparser
from bibtexparser.middlewares import LatexDecodingMiddleware

from models.paper import PaperCreate

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LaTeX cleanup for fields that bibtexparser might not fully decode
# ---------------------------------------------------------------------------

# Common LaTeX commands to strip
_LATEX_CMD_RE = re.compile(r"\\(?:textbf|textit|textrm|texttt|emph|textsc)\{([^}]*)\}")
_LATEX_BRACE_RE = re.compile(r"\{([^}]*)\}")
_LATEX_ACCENT_MAP = {
    r"\'": "\u0301",  # acute
    r"\`": "\u0300",  # grave
    r'\"': "\u0308",  # umlaut
    r"\^": "\u0302",  # circumflex
    r"\~": "\u0303",  # tilde
    r"\=": "\u0304",  # macron
    r"\.": "\u0307",  # dot above
}


def _clean_latex(text: str) -> str:
    """Best-effort cleanup of residual LaTeX markup after bibtexparser decoding."""
    if not text:
        return text
    # Strip \textbf{...}, \emph{...}, etc. → keep inner content
    text = _LATEX_CMD_RE.sub(r"\1", text)
    # Strip remaining braces (BibTeX title-casing protection)
    text = _LATEX_BRACE_RE.sub(r"\1", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Author parsing
# ---------------------------------------------------------------------------

def _parse_authors(raw: str) -> list[str]:
    """
    Parse a BibTeX author string into a list of "Last, First" names.

    BibTeX uses "and" to separate authors. Each author can be:
      - "Last, First"          → keep as-is
      - "First Last"           → reorder to "Last, First"
      - "First Middle Last"    → reorder to "Last, First Middle"
    """
    if not raw:
        return []

    raw = _clean_latex(raw)
    parts = re.split(r"\s+and\s+", raw, flags=re.IGNORECASE)
    authors = []

    for part in parts:
        part = part.strip()
        if not part:
            continue

        if "," in part:
            # Already "Last, First" format
            segments = [s.strip() for s in part.split(",", 1)]
            name = f"{segments[0]}, {segments[1]}" if len(segments) == 2 else part
        else:
            # "First [Middle] Last" → "Last, First [Middle]"
            tokens = part.split()
            if len(tokens) >= 2:
                name = f"{tokens[-1]}, {' '.join(tokens[:-1])}"
            else:
                name = part

        authors.append(name)

    return authors


# ---------------------------------------------------------------------------
# Entry → PaperCreate mapping
# ---------------------------------------------------------------------------

def _extract_year(entry: dict) -> int:
    """Extract a 4-digit year from the entry, returning 0 on failure."""
    raw = entry.get("year", "")
    m = re.search(r"\b((?:19|20)\d{2})\b", str(raw))
    return int(m.group(1)) if m else 0


def _extract_venue(entry: dict) -> str:
    """Pick the best venue field available."""
    for key in ("journal", "booktitle", "publisher", "school", "institution", "organization", "howpublished"):
        val = entry.get(key, "")
        if val:
            return _clean_latex(str(val))
    return "Unknown"


def _extract_doi(entry: dict) -> Optional[str]:
    """Extract and normalize a DOI."""
    raw = entry.get("doi", "")
    if not raw:
        return None
    # Strip URL prefix if present
    doi = str(raw).strip()
    if "doi.org/" in doi:
        doi = doi.split("doi.org/", 1)[-1]
    return doi if doi.startswith("10.") else None


def _extract_arxiv_id(entry: dict) -> Optional[str]:
    """Try to extract an arXiv ID from the eprint field or URL."""
    eprint = entry.get("eprint", "")
    if eprint:
        m = re.search(r"(\d{4}\.\d{4,5})", str(eprint))
        if m:
            return m.group(1)

    # Check url / note fields for arxiv links
    for key in ("url", "note"):
        val = entry.get(key, "")
        m = re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", str(val))
        if m:
            return m.group(1)

    return None


def _extract_pdf_url(entry: dict) -> Optional[str]:
    """Try to find a PDF URL from the entry fields."""
    # Direct PDF field (some exporters include this)
    for key in ("pdf", "file"):
        val = entry.get(key, "")
        if val and str(val).startswith("http"):
            return str(val)

    # URL field if it looks like a PDF
    url = entry.get("url", "")
    if url and (".pdf" in str(url).lower() or "/pdf/" in str(url).lower()):
        return str(url)

    # Construct arXiv PDF URL if we have an arXiv ID
    arxiv_id = _extract_arxiv_id(entry)
    if arxiv_id:
        return f"https://arxiv.org/pdf/{arxiv_id}"

    return None


def entry_to_paper_create(entry: dict, library_id: Optional[str] = None) -> Optional[PaperCreate]:
    """
    Convert a parsed BibTeX entry dict to a PaperCreate model.
    Returns None if the entry has no usable title.
    """
    title = _clean_latex(entry.get("title", ""))
    if not title:
        return None

    authors = _parse_authors(entry.get("author", ""))
    year = _extract_year(entry)
    venue = _extract_venue(entry)
    doi = _extract_doi(entry)
    arxiv_id = _extract_arxiv_id(entry)
    abstract = _clean_latex(entry.get("abstract", ""))
    pdf_url = _extract_pdf_url(entry)

    # Build published_date from year + month if available
    published_date = None
    if year:
        published_date = str(year)
        month_raw = entry.get("month", "")
        if month_raw:
            month_map = {
                "jan": "01", "feb": "02", "mar": "03", "apr": "04",
                "may": "05", "jun": "06", "jul": "07", "aug": "08",
                "sep": "09", "oct": "10", "nov": "11", "dec": "12",
            }
            month_str = str(month_raw).strip().lower()[:3]
            if month_str in month_map:
                published_date = f"{year}-{month_map[month_str]}"
            elif month_str.isdigit():
                published_date = f"{year}-{int(month_str):02d}"

    return PaperCreate(
        title=title,
        authors=authors,
        year=year,
        published_date=published_date,
        venue=venue,
        doi=doi,
        arxiv_id=arxiv_id,
        status="inbox",
        abstract=abstract[:2000] if abstract else None,
        source="human",
        pdf_url=pdf_url,
        library_id=library_id,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class ParsedBibtexEntry:
    """A parsed BibTeX entry with its original key and mapped PaperCreate."""

    def __init__(self, key: str, paper: Optional[PaperCreate], raw_entry: dict, error: Optional[str] = None):
        self.key = key
        self.paper = paper
        self.raw_entry = raw_entry
        self.error = error


def parse_bibtex(content: str) -> list[ParsedBibtexEntry]:
    """
    Parse a BibTeX string and return a list of ParsedBibtexEntry objects.

    Each entry is mapped to a PaperCreate model if possible. Malformed entries
    are included with error messages rather than silently dropped.
    """
    library = bibtexparser.parse_string(content)

    # Apply LaTeX decoding middleware
    try:
        middleware = LatexDecodingMiddleware()
        library = middleware.transform(library)
    except Exception:
        logger.warning("LaTeX decoding middleware failed, proceeding with raw values")

    results = []
    for entry in library.entries:
        key = entry.key or "unknown"
        try:
            # Convert entry to a plain dict of field values
            fields = {k: v.value for k, v in entry.fields_dict.items()}
            fields["ENTRYTYPE"] = entry.entry_type

            paper = entry_to_paper_create(fields)
            if paper is None:
                results.append(ParsedBibtexEntry(
                    key=key, paper=None, raw_entry=fields,
                    error="No title found in entry",
                ))
            else:
                results.append(ParsedBibtexEntry(key=key, paper=paper, raw_entry=fields))
        except Exception as exc:
            logger.warning("Failed to parse BibTeX entry '%s': %s", key, exc)
            results.append(ParsedBibtexEntry(
                key=key, paper=None, raw_entry={},
                error=f"Parse error: {exc}",
            ))

    logger.info("Parsed %d BibTeX entries (%d valid)", len(results), sum(1 for r in results if r.paper))
    return results
