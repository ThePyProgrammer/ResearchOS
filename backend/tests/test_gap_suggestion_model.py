"""Model-level tests for GapSuggestion, PaperRef, GapAnalysisOutput, GapAnalysisRequest.

RED phase: These tests must fail until backend/models/gap_suggestion.py exists.
"""
from __future__ import annotations

import pytest
from models.gap_suggestion import (
    GapSuggestion,
    PaperRef,
    GapAnalysisOutput,
    GapAnalysisRequest,
)


# ---------------------------------------------------------------------------
# PaperRef
# ---------------------------------------------------------------------------

def test_paper_ref_fields():
    """PaperRef validates paper_id, display_label, relevance_note fields."""
    ref = PaperRef(
        paper_id="p1",
        display_label="Smith et al., 2024",
        relevance_note="Tested similar architecture without dropout variation",
    )
    assert ref.paper_id == "p1"
    assert ref.display_label == "Smith et al., 2024"
    assert ref.relevance_note == "Tested similar architecture without dropout variation"


# ---------------------------------------------------------------------------
# GapSuggestion defaults and auto-ID
# ---------------------------------------------------------------------------

def test_gap_suggestion_creates_with_defaults():
    """GapSuggestion auto-generates id and has empty list defaults."""
    s = GapSuggestion(
        gap_type="missing_baseline",
        name="Add vanilla transformer baseline",
        rationale="No baseline comparison against the original transformer architecture",
    )
    assert s.id.startswith("gap_")
    assert len(s.id) == len("gap_") + 8  # "gap_" + 8 hex chars
    assert s.suggested_config == {}
    assert s.paper_refs == []
    assert s.ablation_params == []


def test_gap_suggestion_id_uniqueness():
    """Each GapSuggestion auto-ID is unique."""
    s1 = GapSuggestion(gap_type="replication", name="A", rationale="B")
    s2 = GapSuggestion(gap_type="replication", name="C", rationale="D")
    assert s1.id != s2.id


# ---------------------------------------------------------------------------
# GapSuggestion all four gap_type values
# ---------------------------------------------------------------------------

def test_gap_suggestion_all_types():
    """All four gap_type values validate correctly."""
    for gap_type in ("missing_baseline", "ablation_gap", "config_sweep", "replication"):
        s = GapSuggestion(gap_type=gap_type, name=f"Test {gap_type}", rationale="Test")
        assert s.gap_type == gap_type


# ---------------------------------------------------------------------------
# ablation_params
# ---------------------------------------------------------------------------

def test_ablation_gap_has_params():
    """ablation_gap type with non-empty ablation_params validates correctly."""
    s = GapSuggestion(
        gap_type="ablation_gap",
        name="Ablate learning rate and dropout",
        rationale="No ablation study was performed varying these key hyperparameters",
        ablation_params=["lr", "dropout"],
    )
    assert s.ablation_params == ["lr", "dropout"]
    assert s.gap_type == "ablation_gap"


# ---------------------------------------------------------------------------
# GapAnalysisOutput
# ---------------------------------------------------------------------------

def test_gap_analysis_output_wraps_suggestions():
    """GapAnalysisOutput wraps a list of GapSuggestion objects."""
    suggestions = [
        GapSuggestion(gap_type="missing_baseline", name="Add BERT baseline", rationale="Missing"),
        GapSuggestion(gap_type="config_sweep", name="Sweep learning rate", rationale="LR not varied"),
    ]
    output = GapAnalysisOutput(suggestions=suggestions)
    assert len(output.suggestions) == 2
    assert output.suggestions[0].gap_type == "missing_baseline"
    assert output.suggestions[1].gap_type == "config_sweep"


def test_gap_analysis_output_empty_suggestions():
    """GapAnalysisOutput accepts empty suggestions list."""
    output = GapAnalysisOutput(suggestions=[])
    assert output.suggestions == []


# ---------------------------------------------------------------------------
# GapAnalysisRequest
# ---------------------------------------------------------------------------

def test_gap_analysis_request_defaults():
    """GapAnalysisRequest has empty dismissed_ids by default."""
    req = GapAnalysisRequest()
    assert req.dismissed_ids == []


def test_gap_analysis_request_with_dismissed():
    """GapAnalysisRequest accepts a list of dismissed suggestion IDs."""
    req = GapAnalysisRequest(dismissed_ids=["gap_abc123", "gap_def456"])
    assert req.dismissed_ids == ["gap_abc123", "gap_def456"]


def test_gap_analysis_request_camel_input():
    """GapAnalysisRequest accepts camelCase input (dismissedIds)."""
    req = GapAnalysisRequest.model_validate({"dismissedIds": ["gap_abc"]})
    assert req.dismissed_ids == ["gap_abc"]


# ---------------------------------------------------------------------------
# camelCase serialization
# ---------------------------------------------------------------------------

def test_camel_serialization():
    """GapSuggestion.model_dump(by_alias=True) produces camelCase keys."""
    ref = PaperRef(
        paper_id="p1",
        display_label="Smith et al., 2024",
        relevance_note="Relevant to dropout study",
    )
    s = GapSuggestion(
        gap_type="ablation_gap",
        name="Ablate dropout",
        rationale="Not varied",
        suggested_config={"dropout": 0.0},
        paper_refs=[ref],
        ablation_params=["dropout"],
    )
    dumped = s.model_dump(by_alias=True)
    assert "gapType" in dumped
    assert "suggestedConfig" in dumped
    assert "paperRefs" in dumped
    assert "ablationParams" in dumped
    # snake_case should NOT appear as keys
    assert "gap_type" not in dumped
    assert "suggested_config" not in dumped
    assert "paper_refs" not in dumped
    assert "ablation_params" not in dumped
    assert dumped["gapType"] == "ablation_gap"
    assert dumped["suggestedConfig"] == {"dropout": 0.0}
    assert dumped["ablationParams"] == ["dropout"]
    assert len(dumped["paperRefs"]) == 1
