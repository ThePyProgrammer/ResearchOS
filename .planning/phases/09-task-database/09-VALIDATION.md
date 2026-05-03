---
phase: 9
slug: task-database
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library (frontend) |
| **Config file** | `frontend/vite.config.js` (test block) |
| **Quick run command** | `cd frontend && npm test -- --run --reporter=dot` |
| **Full suite command** | `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run --reporter=dot`
- **After every plan wave:** Run `cd frontend && npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kanban drag between columns | TASK-04 | DnD interaction | Drag card between columns, verify status updates |
| Calendar month navigation | TASK-06 | Visual layout | Navigate months, verify task chips on correct dates |
| Calendar drag to reschedule | TASK-06 | DnD + date | Drag chip to different date, verify due date updates |
| Custom field CRUD | TASK-03 | Full lifecycle | Add text/number/date/select fields, verify in list view |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
