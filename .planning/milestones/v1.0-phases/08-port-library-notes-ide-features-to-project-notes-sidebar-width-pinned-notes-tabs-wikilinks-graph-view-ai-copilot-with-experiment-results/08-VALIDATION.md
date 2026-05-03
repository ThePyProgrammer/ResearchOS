---
phase: 8
slug: port-library-notes-ide-features-to-project-notes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library (frontend), pytest (backend) |
| **Config file** | `frontend/vite.config.js` (test block) |
| **Quick run command** | `cd frontend && npm test -- --run --reporter=dot ProjectNotesIDE` |
| **Full suite command** | `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run --reporter=dot ProjectNotesIDE`
- **After every plan wave:** Run `cd frontend && npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-00-01 | 00 | 0 | IDE-01 | smoke | `npm test -- --run ProjectNotesIDE` | Wave 0 | ⬜ pending |
| 08-00-02 | 00 | 0 | IDE-02 | unit | `npm test -- --run ProjectNotesIDE` | Wave 0 | ⬜ pending |
| 08-00-03 | 00 | 0 | IDE-03 | unit | `npm test -- --run WikiLinkExtension` | Wave 0 | ⬜ pending |
| 08-00-04 | 00 | 0 | IDE-04 | unit | `npm test -- --run api` | Wave 0 | ⬜ pending |
| 08-01-01 | 01 | 1 | IDE-01..04 | smoke | `npm test -- --run ProjectNotesIDE` | Wave 0 | ⬜ pending |
| 08-02-01 | 02 | 2 | IDE-05..06 | smoke | manual — live backend | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/ProjectNotesIDE.test.jsx` — smoke: renders sidebar with project + experiment folders, tab bar, graph toggle
- [ ] `frontend/src/services/api.projectNotesCopilot.test.js` — API shape: sendFn, contextItems with experiment type
- [ ] Backend: `backend/tests/test_project_notes_copilot.py` — experiment context serialization (config + metrics + children)

*Existing infrastructure: vitest configured, @testing-library/react installed*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full IDE flow: sidebar → tabs → editor → wikilinks → graph | IDE-01..04 | Requires live backend + tiptap rendering | Open project notes, create note, add wikilink, toggle graph, verify nodes |
| AI copilot with @experiment context + inline charts | IDE-05 | Requires OpenAI API + experiment data | @-mention an experiment, ask for comparison, verify charts render |
| Copilot suggestion tabs with accept/reject | IDE-06 | Requires live copilot loop | Ask copilot to create/edit a note, verify suggestion tab, accept |
| Cross-experiment tab labels | IDE-02 | DOM interaction | Open notes from 2 experiments, verify tab shows "ExpName > NoteName" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
