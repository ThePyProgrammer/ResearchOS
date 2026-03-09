from typing import Optional

from .base import CamelModel


class RelatedReason(CamelModel):
    type: str
    label: str


class RelatedPaperCandidate(CamelModel):
    openalex_id: str
    title: str
    authors: list[str] = []
    year: int = 0
    venue: str = "Unknown"
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    abstract: Optional[str] = None
    cited_by_count: int = 0
    relevance_score: float = 0.0
    reasons: list[RelatedReason] = []
    already_exists: bool = False
    existing_paper_id: Optional[str] = None
    import_identifier: Optional[str] = None
    openalex_url: Optional[str] = None


class RelatedPapersResponse(CamelModel):
    seed_paper_id: str
    seed_openalex_id: Optional[str] = None
    candidates: list[RelatedPaperCandidate] = []
    total_candidates: int = 0
