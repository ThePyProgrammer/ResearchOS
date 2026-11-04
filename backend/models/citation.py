"""Citation contracts. Retrieval success is not a claim of complete coverage."""
from typing import Literal

from pydantic import Field

from models.base import CamelModel

Provider = Literal["openalex", "crossref", "grobid"]
RunStatus = Literal["succeeded", "partial", "not_found"]


class CitationReference(CamelModel):
    key: str
    identifiers: dict[str, str] = Field(default_factory=dict)
    raw: dict = Field(default_factory=dict)


class CitationResult(CamelModel):
    provider: Provider
    status: RunStatus = "succeeded"
    resolution: Literal["exact", "candidate", "ambiguous", "unresolved"] = "exact"
    identities: dict[str, str] = Field(default_factory=dict)
    references: list[CitationReference] = Field(default_factory=list)
    candidates: list[dict] = Field(default_factory=list)
    message: str | None = None
    version: str = "1"


class CitationJob(CamelModel):
    id: str
    paper_id: str
    provider: Provider
    status: str
    attempts: int
    updated_at: str
    error: str | None = None


class CitationEvidence(CamelModel):
    provider: str
    method: str
    indexed_at: str
    reference: dict


class CitationItem(CamelModel):
    id: str
    title: str
    authors: list[str]
    year: int
    evidence: list[CitationEvidence]


class CitationPage(CamelModel):
    items: list[CitationItem]
    total: int
    limit: int
    offset: int
    direction: Literal["outgoing", "incoming"]
    runs: list[dict]
    jobs: list[CitationJob]
    unresolved_count: int
    indexed_papers: int
    library_papers: int
    pending_jobs: int = 0
