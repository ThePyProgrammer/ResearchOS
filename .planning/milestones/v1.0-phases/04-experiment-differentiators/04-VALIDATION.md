---
phase: 4
slug: experiment-differentiators
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend), vitest 2.x (frontend) |
| **Config file** | backend/pyproject.toml, frontend/vite.config.js |
| **Quick run command** | `cd backend && uv run pytest tests/ -x -q` and `cd frontend && npm run test:run -- --reporter=dot` |
| **Full suite command** | `cd backend && uv run pytest tests/ -q` and `cd frontend && npm run test:run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run commands (backend + frontend)
- **After every plan wave:** Run full suite for both
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | EXP-07 | unit (frontend) | `cd frontend && npm run test:run -- src/pages/ProjectDetail.comparemodal.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EXP-07 | unit (frontend) | same file | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EXP-08 | unit (frontend) | same file | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EXP-09 | unit (backend) | `cd backend && uv run pytest tests/test_experiment_routes.py -x -q` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EXP-09 | unit (backend) | same file | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EXP-09 | unit (backend) | same file | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/ProjectDetail.comparemodal.test.jsx` — stubs for EXP-07, EXP-08 (pure logic unit tests for metricCellClass, configCellClass, union-of-keys helpers)
- [ ] `backend/tests/test_experiment_routes.py` — stubs for EXP-09 (duplicate endpoint route tests using monkeypatch pattern)

*Existing test infrastructure covers framework setup; only test files are missing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Checkbox visual appearance on hover | EXP-07/08 | CSS hover state | Hover over experiment nodes, verify checkbox appears |
| Floating action bar positioning | EXP-07/08 | Layout interaction | Select 2+ experiments, verify bar is visible and positioned correctly |
| CompareModal fullscreen readability | EXP-07/08 | Visual layout | Open compare with 5+ experiments in fullscreen, verify readability |
| Deep clone subtree ordering | EXP-09 | Visual tree structure | Duplicate a parent node with children, verify order matches original |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
