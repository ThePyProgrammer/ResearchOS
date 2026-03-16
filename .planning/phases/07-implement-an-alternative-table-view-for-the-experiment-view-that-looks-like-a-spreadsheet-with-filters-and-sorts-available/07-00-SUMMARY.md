---
phase: 07-experiment-table-view
plan: "00"
subsystem: frontend
tags: [tdd, hooks, testing, table-view]
dependency_graph:
  requires: []
  provides:
    - useLocalStorage hook at frontend/src/hooks/useLocalStorage.js
    - Test contracts for buildColumns, applyFilter, sortRows (RED phase)
  affects:
    - frontend/src/components/NoteGraphView.jsx (now imports from shared hook)
    - Plan 01 must implement and export buildColumns, applyFilter, sortRows to turn GREEN
tech_stack:
  added: []
  patterns:
    - Shared hook extraction pattern (inline → hooks/ directory)
    - TDD RED phase: write tests before implementation
key_files:
  created:
    - frontend/src/hooks/useLocalStorage.js
    - frontend/src/pages/ProjectDetail.tableview.test.jsx
  modified:
    - frontend/src/components/NoteGraphView.jsx
decisions:
  - useLocalStorage extracted as named export to hooks/ so it can be shared with table view persistence
  - Test file imports buildColumns, applyFilter, sortRows from ProjectDetail.jsx; functions not yet exported — RED state is intentional
  - 26 test cases cover all behavior contracts from plan spec (buildColumns: 5 cases, applyFilter: 11 cases, sortRows: 5 cases)
metrics:
  duration: "3 min"
  completed_date: "2026-03-17"
  tasks_completed: 2
  files_modified: 3
---

# Phase 07 Plan 00: Extract useLocalStorage + Table View Test Scaffolds

Shared useLocalStorage hook extracted from NoteGraphView into hooks/useLocalStorage.js, and 26 failing unit tests created for buildColumns, applyFilter, sortRows — the pure helper functions that Plan 01 will implement.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract useLocalStorage hook | 8fbc56f | frontend/src/hooks/useLocalStorage.js, frontend/src/components/NoteGraphView.jsx |
| 2 | Create test scaffolds (RED phase) | a8fde6d | frontend/src/pages/ProjectDetail.tableview.test.jsx |

## Decisions Made

- **useLocalStorage extracted to hooks/ directory** — identical logic as NoteGraphView's inline version; NoteGraphView now imports from the shared location. No behavior change.
- **Test imports from ProjectDetail.jsx** — functions `buildColumns`, `applyFilter`, `sortRows` are not yet exported; this is the intentional RED state that Plan 01 must turn green.
- **26 test cases** — covers all behavioral contracts specified: 5 for buildColumns (namespace format, fixed+dynamic columns, empty list), 11 for applyFilter (all operators: gt, lt, eq, between, empty, notempty, is; config/metric column resolution), 5 for sortRows (asc/desc, nulls-last, null sort input).

## Verification

- useLocalStorage.js exists in hooks/ with named export: confirmed
- NoteGraphView.jsx imports from ../hooks/useLocalStorage: confirmed
- Full existing test suite passes (52 tests across 6 files): confirmed
- New test file has 26 test cases across 3 describe blocks: confirmed
- New tests are in RED state (expected — implementations come in Plan 01): confirmed

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- frontend/src/hooks/useLocalStorage.js: FOUND
- frontend/src/pages/ProjectDetail.tableview.test.jsx: FOUND
- Commit 8fbc56f: FOUND
- Commit a8fde6d: FOUND
