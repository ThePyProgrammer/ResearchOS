---
phase: 3
slug: experiment-tree
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (backend) / manual browser (frontend) |
| **Config file** | backend/pyproject.toml |
| **Quick run command** | `cd backend && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd backend && uv run pytest tests/ -v` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/ -x -q`
- **After every plan wave:** Run `cd backend && uv run pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated during planning* | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_experiment_service.py` — stubs for EXP-01 through EXP-06
- [ ] `backend/tests/conftest.py` — shared fixtures (if not already present)

*Existing infrastructure (pytest, Supabase test client) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tree DnD reorder | EXP-02 | Drag interaction requires browser | Create 3 experiments, drag to reorder, verify position updates |
| Status badge colors | EXP-05 | Visual CSS verification | Set each status, verify correct color badge renders |
| Tiptap notes on experiment | EXP-06 | Rich text editor interaction | Open experiment, create note, verify tiptap renders and saves |
| Paper/website linking | LIT-02 | Picker interaction | Open experiment, link a paper, verify link displays |
| Sidebar navigation | NAV-03 | Navigation UX | Click experiments in sidebar, verify correct view loads |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
