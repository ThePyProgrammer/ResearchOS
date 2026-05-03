---
phase: 12
slug: literature-review-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 + @testing-library/react 16.3 (frontend), pytest (backend) |
| **Config file** | `frontend/vite.config.js` (test key), `backend/pyproject.toml` |
| **Quick run command** | `cd frontend && npx vitest run src/pages/ProjectReviewDashboard.test.jsx` |
| **Full suite command** | `cd frontend && npx vitest run && cd ../backend && uv run pytest tests/test_keyword_extraction.py -x` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run src/pages/ProjectReviewDashboard.test.jsx`
- **After every plan wave:** Run `cd frontend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | REV-01, REV-02, REV-03, REV-04, REV-06, REV-08 | unit + smoke | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx src/pages/ProjectReviewDashboard.smoke.test.jsx` | W0 | pending |
| 12-01-02 | 01 | 1 | REV-06, REV-07 | unit + smoke | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx src/pages/ProjectReviewDashboard.smoke.test.jsx` | W0 | pending |
| 12-02-01 | 02 | 1 | REV-05 | unit | `uv run pytest tests/test_keyword_extraction.py -x` | W0 | pending |
| 12-03-01 | 03 | 2 | REV-01, REV-02 | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | W0 | pending |
| 12-03-02 | 03 | 2 | REV-08 | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | W0 | pending |
| 12-04-01 | 04 | 2 | REV-03 | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | W0 | pending |
| 12-04-02 | 04 | 2 | REV-04, REV-05 | unit | `npx vitest run src/pages/ProjectReviewDashboard.test.jsx` | W0 | pending |
| 12-04-03 | 04 | 2 | REV-07, REV-08 | checkpoint | Visual inspection by user | n/a | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/ProjectReviewDashboard.test.jsx` — unit tests for pure utility functions (REV-01 through REV-04, REV-07, REV-08)
- [ ] `frontend/src/pages/ProjectReviewDashboard.smoke.test.jsx` — smoke test for component shell rendering (REV-06)
- [ ] `backend/tests/test_keyword_extraction.py` — unit tests for REV-05

*Existing test infrastructure (Vitest + pytest) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| d3 force graph renders with correct node positions and edges | REV-01 visual | d3 SVG requires real DOM layout engine | 1. Open Review tab with 5+ linked papers 2. Verify nodes and edges render 3. Verify zoom/pan works |
| Heatmap cells show correct colors and gap highlighting | REV-04 visual | d3 SVG rendering needs browser | 1. Open Review tab 2. Check heatmap renders with year x venue 3. Verify empty cells have gap treatment |
| Options popover styling and positioning | REV-07 visual | Layout-dependent | 1. Click gear icon 2. Verify popover appears near icon 3. Verify dropdowns work |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
