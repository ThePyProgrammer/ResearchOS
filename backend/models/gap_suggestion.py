"""Pydantic models for AI experiment gap analysis suggestions."""
import uuid
from typing import Any

from pydantic import BaseModel, Field

from models.base import CamelModel


class PaperRef(CamelModel):
    """A reference to a paper that supports or motivates a gap suggestion."""

    paper_id: str
    display_label: str  # e.g. "Smith et al., 2024"
    relevance_note: str  # 1-line explanation of why this paper is relevant


class GapSuggestion(CamelModel):
    """A single AI-generated experiment gap suggestion."""

    id: str = Field(default_factory=lambda: f"gap_{uuid.uuid4().hex[:8]}")
    gap_type: str  # "missing_baseline" | "ablation_gap" | "config_sweep" | "replication"
    name: str
    rationale: str
    suggested_config: dict[str, Any] = Field(default_factory=dict)
    paper_refs: list[PaperRef] = Field(default_factory=list)
    ablation_params: list[str] = Field(default_factory=list)


class GapAnalysisOutput(BaseModel):
    """Structured output from the gap analysis agent."""

    suggestions: list[GapSuggestion]


class GapAnalysisRequest(CamelModel):
    """Request body for triggering gap analysis."""

    dismissed_ids: list[str] = Field(default_factory=list)
