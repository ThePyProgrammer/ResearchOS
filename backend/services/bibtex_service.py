"""
BibTeX import/export service.

Import: parses .bib files and maps entries to PaperCreate models.
Export: converts Paper models to BibTeX strings.
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
    Parse a BibTeX author string into a list of "First [Middle] Last" names.

    BibTeX uses "and" to separate authors. Each author can be:
      - "Last, First"          → reorder to "First Last"
      - "Last, First Middle"   → reorder to "First Middle Last"
      - "First Last"           → keep as-is
      - "First Middle Last"    → keep as-is
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
            # "Last, First [Middle]" → "First [Middle] Last"
            segments = [s.strip() for s in part.split(",", 1)]
            if len(segments) == 2 and segments[1]:
                name = f"{segments[1]} {segments[0]}"
            else:
                name = segments[0]
        else:
            # Already "First [Middle] Last" — keep as-is
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
    """Try to extract an arXiv ID from eprint, URL, journal, or other fields."""
    eprint = entry.get("eprint", "")
    if eprint:
        m = re.search(r"(\d{4}\.\d{4,5})", str(eprint))
        if m:
            return m.group(1)

    # Check common fields for arxiv links or "arXiv:XXXX.XXXXX" patterns
    for key in ("url", "note", "journal", "booktitle", "howpublished"):
        val = str(entry.get(key, ""))
        # Match "arxiv.org/abs/XXXX.XXXXX" style URLs
        m = re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", val)
        if m:
            return m.group(1)
        # Match "arXiv:XXXX.XXXXX" or "arXiv preprint arXiv:XXXX.XXXXX"
        m = re.search(r"arXiv[:\s]+(\d{4}\.\d{4,5})", val, re.IGNORECASE)
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


# ---------------------------------------------------------------------------
# Export: Paper → BibTeX
# ---------------------------------------------------------------------------

def _make_citation_key(paper) -> str:
    """
    Generate a BibTeX citation key like 'vaswani2017attention'.

    Format: first author last name (lowercase) + year + first significant title word.
    """
    # First author's last name
    last_name = "unknown"
    if paper.authors:
        first_author = paper.authors[0]
        if "," in first_author:
            # "Last, First" format
            last_name = first_author.split(",")[0].strip()
        else:
            # "First Last" format
            tokens = first_author.split()
            last_name = tokens[-1] if tokens else "unknown"

    last_name = re.sub(r"[^a-zA-Z]", "", last_name).lower()

    # Year
    year = str(paper.year) if paper.year else ""

    # First significant word of title
    stop_words = {"a", "an", "the", "on", "of", "for", "in", "to", "and", "with", "is", "are", "by"}
    title_word = ""
    for word in paper.title.split():
        clean = re.sub(r"[^a-zA-Z]", "", word).lower()
        if clean and clean not in stop_words:
            title_word = clean
            break

    return f"{last_name}{year}{title_word}" or "entry"


def _escape_bibtex(text: str) -> str:
    """Escape special BibTeX characters in a string."""
    if not text:
        return ""
    # Escape &, %, #, _ which are special in LaTeX/BibTeX
    for char in ("&", "%", "#"):
        text = text.replace(char, f"\\{char}")
    return text


def _format_authors_bibtex(authors: list[str]) -> str:
    """
    Format authors for BibTeX: "Last, First and Last, First and ...".

    Input authors may be "First Last" or "Last, First" — normalize to "Last, First".
    """
    bibtex_names = []
    for author in authors:
        if "," in author:
            # Already "Last, First" — keep as-is
            bibtex_names.append(author.strip())
        else:
            # "First [Middle] Last" → "Last, First [Middle]"
            tokens = author.strip().split()
            if len(tokens) >= 2:
                bibtex_names.append(f"{tokens[-1]}, {' '.join(tokens[:-1])}")
            else:
                bibtex_names.append(author.strip())

    return " and ".join(bibtex_names)


def paper_to_bibtex(paper) -> str:
    """Convert a Paper model to a BibTeX entry string."""
    key = _make_citation_key(paper)

    # Choose entry type based on venue
    venue_lower = (paper.venue or "").lower()
    if paper.arxiv_id or "arxiv" in venue_lower:
        entry_type = "article"
    elif any(kw in venue_lower for kw in ("proceedings", "conference", "workshop", "symposium")):
        entry_type = "inproceedings"
    else:
        entry_type = "article"

    fields = []
    fields.append(f"  title={{{_escape_bibtex(paper.title)}}}")

    if paper.authors:
        fields.append(f"  author={{{_escape_bibtex(_format_authors_bibtex(paper.authors))}}}")

    if paper.year:
        fields.append(f"  year={{{paper.year}}}")

    if paper.venue and paper.venue != "Unknown":
        if entry_type == "inproceedings":
            fields.append(f"  booktitle={{{_escape_bibtex(paper.venue)}}}")
        else:
            fields.append(f"  journal={{{_escape_bibtex(paper.venue)}}}")

    if paper.doi:
        fields.append(f"  doi={{{paper.doi}}}")

    if paper.arxiv_id:
        fields.append(f"  eprint={{{paper.arxiv_id}}}")
        fields.append("  archiveprefix={arXiv}")

    if paper.abstract:
        fields.append(f"  abstract={{{_escape_bibtex(paper.abstract)}}}")

    if paper.pdf_url:
        fields.append(f"  url={{{paper.pdf_url}}}")

    fields_str = ",\n".join(fields)
    return f"@{entry_type}{{{key},\n{fields_str}\n}}"


def export_bibtex(papers: list) -> str:
    """Convert a list of Paper models to a complete BibTeX file string."""
    # Ensure unique citation keys
    seen_keys: dict[str, int] = {}
    entries = []

    for paper in papers:
        entry = paper_to_bibtex(paper)
        # Extract the key and deduplicate
        key = _make_citation_key(paper)
        if key in seen_keys:
            seen_keys[key] += 1
            # Replace first occurrence of the key with a suffixed version
            new_key = f"{key}{chr(96 + seen_keys[key])}"  # key, keyb, keyc, ...
            entry = entry.replace(f"{{{key},", f"{{{new_key},", 1)
        else:
            seen_keys[key] = 1

        entries.append(entry)

    return "\n\n".join(entries) + "\n"
