---
phase: 2
slug: research-questions-literature
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 |
| **Config file** | `frontend/vite.config.js` (test section) |
| **Quick run command** | `cd frontend && npm run test:run -- --reporter=verbose src/pages/ProjectDetail.smoke.test.jsx` |
| **Full suite command** | `cd frontend && npm run test:run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run test:run -- --reporter=verbose src/pages/ProjectDetail.smoke.test.jsx`
- **After every plan wave:** Run `cd frontend && npm run test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | RQ-01 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | RQ-02 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | RQ-03 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | RQ-04 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | RQ-05 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | RQ-06 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | LIT-01 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | LIT-03 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | LIT-04 | smoke | `npm run test:run -- src/pages/ProjectDetail.smoke.test.jsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/ProjectDetail.smoke.test.jsx` — stubs for RQ-01 through LIT-04
- [ ] `frontend/src/test/setup.js` — already exists (imports @testing-library/jest-dom/vitest)

*Wave 0 creates test stubs that will be filled during execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop reparenting | RQ-06 | DnD requires pointer simulation beyond smoke tests | Drag a sub-question to root area; drag a childless primary onto another; verify tree structure updates |
| Gap indicator tooltip | LIT-03 | Tooltip hover is unreliable in jsdom | Hover over warning icon on an RQ with no papers; verify "No supporting literature linked" tooltip |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
