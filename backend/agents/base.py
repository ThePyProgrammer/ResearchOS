"""
Shared infrastructure for ResearchOS agentic workflows.

Provides:
  - RunLogger: live run-record logging via run_service
  - search_arxiv: async arXiv API paper fetch
  - emit_activity: append activity feed entries
"""

import logging
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_ARXIV_NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
    "opensearch": "http://a9.com/-/spec/opensearch/1.1/",
}
_ARXIV_BASE = "http://export.arxiv.org/api/query"


# ---------------------------------------------------------------------------
# Run logging helpers
# ---------------------------------------------------------------------------

class RunLogger:
    """Appends structured log entries to a run record in real time."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id

    def _now(self) -> str:
        return datetime.now(timezone.utc).strftime("%H:%M:%S")

    def _append(self, level: str, message: str) -> None:
        from services import run_service
        try:
            run_service.append_log(self.run_id, self._now(), level, message)
        except Exception as exc:
            logger.warning("RunLogger.append failed for run %s: %s", self.run_id, exc)
        logger.info("[run=%s][%s] %s", self.run_id, level, message)

    def info(self, msg: str) -> None:
        self._append("INFO", msg)

    def tool(self, msg: str) -> None:
        self._append("TOOL", msg)

    def agent(self, msg: str) -> None:
        self._append("AGENT", msg)

    def error(self, msg: str) -> None:
        self._append("ERROR", msg)

    def set_progress(self, progress: int, step: str) -> None:
        from services import run_service
        try:
            run_service.update_progress(self.run_id, progress, step)
        except Exception as exc:
            logger.warning("RunLogger.set_progress failed for run %s: %s", self.run_id, exc)


# ---------------------------------------------------------------------------
# arXiv search utilities
# ---------------------------------------------------------------------------

def _format_arxiv_query(terms: list[str]) -> str:
    """Build an arXiv API search_query string from a list of terms."""
    parts: list[str] = []
    for term in terms:
        term = term.strip()
        if not term:
            continue
        if " " in term:
            parts.append(f'all:%22{term.replace(" ", "+")}%22')
        else:
            parts.append(f"all:{term}")
    return "+AND+".join(parts)


async def search_arxiv(query: str, max_results: int = 50) -> list[dict]:
    """
    Fetch papers from the arXiv API.

    query: slash-separated search terms, e.g. 'transformer/attention/NLP'.
    Returns a list of paper dicts with keys:
        title, arxiv_id, abstract, authors (list[str]), year (int), url.
    """
    terms = [t.strip() for t in query.split("/") if t.strip()]
    if not terms:
        return []

    formatted = _format_arxiv_query(terms)
    url = f"{_ARXIV_BASE}?search_query={formatted}&start=0&max_results={max_results}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            xml_data = response.content
    except httpx.HTTPError as exc:
        logger.error("arXiv HTTP error for query '%s': %s", query, exc)
        return []
    except Exception as exc:
        logger.error("arXiv request failed for query '%s': %s", query, exc)
        return []

    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as exc:
        logger.error("Failed to parse arXiv XML response: %s", exc)
        return []

    papers: list[dict] = []
    for entry in root.findall("atom:entry", _ARXIV_NS):
        try:
            title_el = entry.find("atom:title", _ARXIV_NS)
            title = (title_el.text or "").strip()

            id_el = entry.find("atom:id", _ARXIV_NS)
            raw_id = (id_el.text or "").strip()
            # Extract bare arXiv ID: http://arxiv.org/abs/2303.01234v2 → 2303.01234
            arxiv_id = raw_id.split("/abs/")[-1] if "/abs/" in raw_id else raw_id.split("/")[-1]
            # Strip version suffix for stable ID
            arxiv_id = arxiv_id.rsplit("v", 1)[0] if arxiv_id and "v" in arxiv_id[-3:] else arxiv_id

            summary_el = entry.find("atom:summary", _ARXIV_NS)
            abstract = (summary_el.text or "").strip()

            published_el = entry.find("atom:published", _ARXIV_NS)
            published = (published_el.text or "")[:10]
            year = int(published[:4]) if published and published[:4].isdigit() else 0

            authors: list[str] = []
            for author_el in entry.findall("atom:author", _ARXIV_NS):
                name_el = author_el.find("atom:name", _ARXIV_NS)
                if name_el is not None and name_el.text:
                    authors.append(name_el.text.strip())

            if not title or not arxiv_id:
                continue

            papers.append(
                {
                    "title": title,
                    "arxiv_id": arxiv_id,
                    "abstract": abstract,
                    "authors": authors,
                    "year": year,
                    "url": f"https://arxiv.org/abs/{arxiv_id}",
                }
            )
        except Exception as exc:
            logger.warning("Failed to parse arXiv entry: %s", exc)
            continue

    return papers


# ---------------------------------------------------------------------------
# Activity feed helper
# ---------------------------------------------------------------------------

def emit_activity(
    run_id: str,
    title: str,
    detail: str,
    icon: str = "smart_toy",
    icon_color: str = "text-purple-600",
    icon_bg: str = "bg-purple-100",
    action_label: Optional[str] = None,
    action_href: Optional[str] = None,
) -> None:
    """Prepend an entry to the activity feed."""
    from services.storage import load_json, save_json

    try:
        items = load_json("activity.json")
        entry: dict = {
            "id": f"a_{uuid.uuid4().hex[:8]}",
            "type": "agent",
            "icon": icon,
            "icon_color": icon_color,
            "icon_bg": icon_bg,
            "title": title,
            "detail": detail,
            "badges": None,
            "time": "just now",
            "running": None,
            "progress": None,
            "current_step": None,
            "action": {"label": action_label, "href": action_href}
            if action_label
            else None,
        }
        items.insert(0, entry)
        save_json("activity.json", items)
    except Exception as exc:
        logger.warning("emit_activity failed for run %s: %s", run_id, exc)
