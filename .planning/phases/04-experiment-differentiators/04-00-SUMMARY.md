---
phase: 04-experiment-differentiators
plan: "00"
subsystem: testing
tags: [vitest, pytest, xfail, unit-tests, test-scaffolding]

requires:
  - phase: 03-experiment-tree
    provides: experiment tree infrastructure with ExperimentSection, ExperimentNode, KVEditor, and aggregateDescendants

provides:
  - Failing test stubs (xfail) for EXP-09 duplicate endpoint covering shallow, deep, and not-found cases
  - Passing pure-logic unit tests for EXP-07 metricCellClass, EXP-08 configCellClass, and union-of-keys helpers
  - Contract definitions that Plans 04-01 and 04-02 must satisfy

affects:
  - 04-01-PLAN (must implement duplicate endpoint to make xfail stubs pass)
  - 04-02-PLAN (must extract metricCellClass/configCellClass into CompareModal to match test contracts)

tech-stack:
  added: []
  patterns:
    - xfail marks for Wave 0 test stubs — endpoint-not-implemented tests expected to fail until production plan ships
    - inline helper implementations in test files to define API contract before extraction into production code

key-files:
  created:
    - backend/tests/test_experiment_routes.py
    - frontend/src/pages/ProjectDetail.comparemodal.test.jsx
  modified: []

key-decisions:
  - "xfail marks chosen over pytest.skip so test runner counts these as xfail (not skipped), giving correct signal once Plan 01 ships (xpass becomes visible)"
  - "Frontend tests inline helper implementations from RESEARCH.md so tests pass immediately and define the contract Plan 02 must match"
  - "union-of-keys helper tested with null/undefined object inputs to ensure CompareModal handles experiments with no metrics/config gracefully"

patterns-established:
  - "Wave 0 scaffold pattern: write xfail backend tests + passing frontend pure-logic tests before implementing production code"

requirements-completed: [EXP-07, EXP-08, EXP-09]

duration: 5min
completed: 2026-03-16
---

# Phase 4 Plan 00: Experiment Differentiators Test Scaffolds Summary

**xfail backend stubs for EXP-09 duplicate endpoint + 18 passing pure-logic unit tests for EXP-07/EXP-08 metricCellClass, configCellClass, and union-of-keys helpers**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T19:50:27Z
- **Completed:** 2026-03-16T19:55:27Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `backend/tests/test_experiment_routes.py` with 3 xfail tests for `POST /api/experiments/{id}/duplicate` (shallow clone, deep clone with `deep=True` forwarding, 404 not-found)
- Created `frontend/src/pages/ProjectDetail.comparemodal.test.jsx` with 18 passing unit tests covering metricCellClass (EXP-07), configCellClass (EXP-08), and union-of-keys across 6 edge cases each
- Verified backend runs `3 xfailed` and frontend runs `18 passed` before any production code is written

## Task Commits

1. **Task 1: Create backend and frontend test scaffolds for Phase 4** - `b08cf5a` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/tests/test_experiment_routes.py` — 3 xfail-marked route tests for EXP-09 duplicate endpoint, following monkeypatch pattern from test_projects_routes.py
- `frontend/src/pages/ProjectDetail.comparemodal.test.jsx` — 18 passing pure-logic tests with inline implementations of metricCellClass, configCellClass, and unionKeys

## Decisions Made

- Used `pytest.mark.xfail(reason="Plan 04-01 not yet implemented")` rather than `pytest.mark.skip` — xfail produces a clearly distinguishable signal in pytest output when the test starts passing (xpass) after Plan 01 ships
- Inlined helper function implementations in the frontend test file (copied from RESEARCH.md code examples) so tests pass immediately while still defining the exact API contract Plan 02 must match during extraction
- The `test_duplicate_experiment_deep` test verifies `mock_dup.assert_called_once()` and checks that `True` appears in call args — this is deliberately flexible because the exact function signature (positional vs keyword `deep` parameter) is determined by Plan 01

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 0 scaffolds complete; Plans 04-01 and 04-02 have real automated verification targets
- Plan 04-01 must implement `POST /api/experiments/{id}/duplicate` + `duplicate_experiment()` service to turn xfail tests into passing tests
- Plan 04-02 must implement CompareModal with metricCellClass/configCellClass that match the contracts defined in the frontend test file

---
*Phase: 04-experiment-differentiators*
*Completed: 2026-03-16*
