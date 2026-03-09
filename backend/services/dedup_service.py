"""
Duplicate detection service for papers.

Provides centralized dedup logic used by all import paths:
  1. Exact DOI match (case-insensitive)
  2. Exact arXiv ID match
  3. Normalized title match (lowercase, no punctuation, collapsed whitespace)

Returns candidates with a confidence level so the frontend can decide
whether to block or warn.
"""

import logging
import re
from typing import Optional

from models.paper import Paper
from services import paper_service

logger = logging.getLogger(__name__)


def _normalize_title(title: str) -> str:
    """Normalize a title for fuzzy matching: lowercase, strip punctuation, collapse whitespace."""
    t = title.lower().strip()
    t = re.sub(r"[^a-z0-9\s]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


class DuplicateCandidate:
    """A potential duplicate match."""

    def __init__(self, paper: Paper, confidence: str, match_field: str):
        self.paper = paper
        self.confidence = confidence  # "exact" | "likely"
        self.match_field = match_field  # "doi" | "arxiv_id" | "title"

    def to_dict(self) -> dict:
        return {
            "id": self.paper.id,
            "title": self.paper.title,
            "authors": self.paper.authors,
            "year": self.paper.year,
            "confidence": self.confidence,
            "matchField": self.match_field,
        }


def find_duplicates(
    title: str,
    doi: Optional[str] = None,
    arxiv_id: Optional[str] = None,
    library_id: Optional[str] = None,
) -> list[DuplicateCandidate]:
    """
    Find potential duplicate papers in the library.

    Checks in order:
      1. Exact DOI match (confidence: exact)
      2. Exact arXiv ID match (confidence: exact)
      3. Normalized title match (confidence: likely)

    Returns a list of candidates, best matches first. Empty list = no duplicates.
    """
    existing = paper_service.list_papers(library_id=library_id)
    candidates: list[DuplicateCandidate] = []
    seen_ids: set[str] = set()

    # 1. DOI match
    if doi:
        doi_lower = doi.lower()
        for p in existing:
            if p.doi and p.doi.lower() == doi_lower and p.id not in seen_ids:
                candidates.append(DuplicateCandidate(p, "exact", "doi"))
                seen_ids.add(p.id)

    # 2. arXiv ID match
    if arxiv_id:
        for p in existing:
            if p.arxiv_id and p.arxiv_id == arxiv_id and p.id not in seen_ids:
                candidates.append(DuplicateCandidate(p, "exact", "arxiv_id"))
                seen_ids.add(p.id)

    # 3. Normalized title match
    if title:
        norm = _normalize_title(title)
        if norm and len(norm) > 10:  # skip very short titles to avoid false positives
            for p in existing:
                if p.id not in seen_ids:
                    p_norm = _normalize_title(p.title)
                    if p_norm and p_norm == norm:
                        candidates.append(DuplicateCandidate(p, "likely", "title"))
                        seen_ids.add(p.id)

    return candidates
