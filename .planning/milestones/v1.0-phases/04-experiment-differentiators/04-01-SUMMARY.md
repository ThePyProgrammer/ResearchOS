---
phase: 04-experiment-differentiators
plan: 01
subsystem: ui
tags: [react, fastapi, experiment, duplication, tree]

# Dependency graph
requires:
  - phase: 04-experiment-differentiators
    provides: Wave 0 test scaffolds for duplicate endpoint (xfail stubs in test_experiment_routes.py)
  - phase: 03-experiment-tree
    provides: ExperimentNode, ExperimentCreateModal, ExperimentSection, experimentsApi base

provides:
  - POST /api/experiments/{exp_id}/duplicate endpoint (shallow and deep)
  - duplicate_experiment() and _deep_clone_children() service functions
  - experimentsApi.duplicate() frontend method
  - Duplicate menu item in ExperimentNode context menu (leaf: pre-filled modal, parent: API call)
  - parentId prop threaded through ExperimentNode hierarchy

affects: [04-02-compare-modal, any phase using ExperimentNode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leaf duplicate: open pre-filled create modal as sibling (user can tweak before saving)"
    - "Parent deep-clone: call API directly without modal (user cannot meaningfully edit entire subtree)"
    - "_deep_clone_children recursive helper sorted by position for stable ordering"
    - "parentId prop threaded through ExperimentNode so 'Duplicate' creates sibling, not child"

key-files:
  created: []
  modified:
    - backend/services/experiment_service.py
    - backend/routers/experiments.py
    - frontend/src/services/api.js
    - frontend/src/pages/ProjectDetail.jsx
    - backend/tests/test_experiment_routes.py

key-decisions:
  - "Leaf duplicate opens pre-filled ExperimentCreateModal (not direct API) so user can rename/tweak config before saving — same pattern as other create flows"
  - "Parent deep-clone calls experimentsApi.duplicate(id, { deep: true }) directly — no modal, onRefresh() after completion"
  - "'Duplicate with children' only appears in the menu when hasChildren is true — not shown for leaf nodes"
  - "initialName/initialConfig props added to ExperimentCreateModal with defaults — backward compatible, no existing callers affected"
  - "xfail marks removed from test_experiment_routes.py once endpoint implemented — all 3 tests now pass"

patterns-established:
  - "Pre-filled modal pattern: pass initialName + initialConfig to ExperimentCreateModal for duplication UX"
  - "parentId threading: ExperimentSection passes parentId=null to roots, ExperimentNode passes parentId=experiment.id to children"

requirements-completed: [EXP-09]

# Metrics
duration: 10min
completed: 2026-03-16
---

# Phase 4 Plan 01: Experiment Duplication Summary

**Shallow and deep experiment duplication via POST /api/experiments/{id}/duplicate — leaf duplicate opens pre-filled create modal as sibling; parent duplicate deep-clones entire subtree via API**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-16T12:00:00Z
- **Completed:** 2026-03-16T12:06:09Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Backend `duplicate_experiment()` with shallow clone (same config, empty metrics, status "planned") and `_deep_clone_children()` for recursive subtree cloning
- `POST /api/experiments/{exp_id}/duplicate?deep=true` endpoint returning 201 with the new root experiment
- `experimentsApi.duplicate()` in frontend api.js
- "Duplicate" and "Duplicate with children" context menu items in ExperimentNode with correct sibling/deep-clone behavior
- `parentId` prop correctly threaded from ExperimentSection roots through ExperimentNode children
- All 3 xfail tests in `test_experiment_routes.py` now pass as real assertions

## Task Commits

1. **Task 1: Backend duplicate endpoint + frontend API client** - `de659b1` (feat)
2. **Task 2: Duplicate UX in ExperimentNode context menu** - `7e74991` (feat)

## Files Created/Modified
- `backend/services/experiment_service.py` - Added duplicate_experiment() and _deep_clone_children()
- `backend/routers/experiments.py` - Added POST /api/experiments/{exp_id}/duplicate route
- `frontend/src/services/api.js` - Added experimentsApi.duplicate() method
- `frontend/src/pages/ProjectDetail.jsx` - ExperimentCreateModal initialName/initialConfig props, ExperimentNode parentId prop, Duplicate/Duplicate-with-children menu items
- `backend/tests/test_experiment_routes.py` - Removed xfail marks; all 3 tests now pass

## Decisions Made
- Leaf duplicate opens pre-filled `ExperimentCreateModal` (not a direct API call) so users can rename/tweak config before saving — consistent with existing create flows
- Parent deep-clone calls the API directly and calls `onRefresh()` — no modal since editing an entire subtree in one form is impractical
- `_deep_clone_children` sorts children by `position` before cloning for stable child ordering
- `initialName` and `initialConfig` default to `''`/`{}` in `ExperimentCreateModal` — fully backward compatible

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Duplicate endpoint is ready; Phase 04-02 (Compare Modal) can use the same `experimentsApi` pattern
- `parentId` threading is complete and stable for any future ExperimentNode extensions

---
*Phase: 04-experiment-differentiators*
*Completed: 2026-03-16*

## Self-Check: PASSED

All files present. All commits verified. Key functions confirmed in source.
