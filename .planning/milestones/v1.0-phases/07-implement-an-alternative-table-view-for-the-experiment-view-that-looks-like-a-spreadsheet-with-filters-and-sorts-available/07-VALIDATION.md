---
phase: 7
slug: experiment-table-view
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) |
| **Config file** | frontend/vite.config.js |
| **Quick run command** | `cd frontend && npx vitest run --reporter=dot src/pages/ProjectDetail.tableview.test.jsx` |
| **Full suite command** | `cd frontend && npx vitest run --reporter=dot` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --reporter=dot src/pages/ProjectDetail.tableview.test.jsx`
- **After every plan wave:** Run `cd frontend && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated during planning* | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/ProjectDetail.tableview.test.jsx` — stubs for table view helpers (column generation, filter logic, sort logic)
- [ ] `frontend/src/hooks/useLocalStorage.js` — extract from NoteGraphView.jsx for reuse

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Column drag reorder | Table layout | Requires browser DnD interaction | Drag a column header to reorder, verify columns persist after refresh |
| Column resize | Table layout | Requires browser pointer interaction | Drag column border, verify width changes and persists |
| Sticky header/column | Table layout | Visual CSS verification | Scroll table in both directions, verify Name column and header stay visible |
| Filter bar interaction | Filtering | Filter chip creation requires live UI | Add a filter chip, set operator/value, verify rows filter correctly |
| Double-click cell edit | Inline editing | Interactive state flow | Double-click a cell, change value, press Enter, verify save |
| View toggle animation | View switching | Visual transition | Click tree/table toggle, verify smooth switch between views |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
