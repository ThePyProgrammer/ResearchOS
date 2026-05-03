---
phase: 11
slug: ai-experiment-gap-analysis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.4.0 + pytest-mock 3.14.0 |
| **Config file** | `backend/pyproject.toml` (testpaths = ["tests"]) |
| **Quick run command** | `cd backend && uv run pytest tests/test_gap_analysis_routes.py -x` |
| **Full suite command** | `cd backend && uv run pytest tests/ -x` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/test_gap_analysis_routes.py -x`
- **After every plan wave:** Run `cd backend && uv run pytest tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-00-01 | 00 | 0 | GAP-01 | unit (route) | `uv run pytest tests/test_gap_analysis_routes.py::test_analyze_gaps_returns_suggestions -x` | ❌ W0 | ⬜ pending |
| 11-00-02 | 00 | 0 | GAP-01 | unit (route) | `uv run pytest tests/test_gap_analysis_routes.py::test_analyze_gaps_project_not_found -x` | ❌ W0 | ⬜ pending |
| 11-00-03 | 00 | 0 | GAP-02 | unit (model) | `uv run pytest tests/test_gap_suggestion_model.py -x` | ❌ W0 | ⬜ pending |
| 11-00-04 | 00 | 0 | GAP-04 | unit (model) | `uv run pytest tests/test_gap_suggestion_model.py::test_ablation_gap_has_params -x` | ❌ W0 | ⬜ pending |
| 11-00-05 | 00 | 0 | GAP-05 | unit (service) | `uv run pytest tests/test_gap_analysis_routes.py::test_paper_context_included -x` | ❌ W0 | ⬜ pending |
| 11-xx-xx | 01+ | 1+ | GAP-03 | existing | Covered by `test_experiment_routes.py::test_create_experiment` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_gap_analysis_routes.py` — stubs for GAP-01, GAP-05 route-level tests
- [ ] `backend/tests/test_gap_suggestion_model.py` — stubs for GAP-02, GAP-04 model validation tests

*Wave 0 creates failing test stubs; implementation plans make them green.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag suggestion card onto mini-tree creates child experiment | GAP-03 | DnD requires browser interaction | Drag card, verify experiment appears in tree, refresh to confirm persistence |
| Streaming card appearance animation | GAP-01 | Visual timing/animation | Trigger analysis, verify cards appear one-by-one with stagger |
| Dismiss with undo toast | GAP-01 | UI interaction + timing | Dismiss card, verify fade + toast, click undo, verify card returns |
| Background notification on navigate-away | GAP-01 | Multi-tab interaction | Trigger analysis, switch tab, verify toast when complete |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
