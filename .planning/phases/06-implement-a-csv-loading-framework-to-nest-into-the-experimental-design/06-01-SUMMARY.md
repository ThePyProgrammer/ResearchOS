---
phase: 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design
plan: 01
subsystem: ui
tags: [react, fastapi, papaparse, csv-import, experiments, pydantic]

# Dependency graph
requires:
  - phase: 06-00
    provides: csvImportUtils.js with all 7 pure utility functions (buildImportTree, bfsFlattenImportTree, etc.)
  - phase: 03-experiment-tree
    provides: experiment CRUD service, experiment models, ExperimentSection in ProjectDetail.jsx
provides:
  - POST /api/projects/{project_id}/experiments/import-csv endpoint with BFS bulk creation
  - ExperimentImportItem, ExperimentImportRequest, ExperimentImportResult Pydantic models
  - bulk_create_experiment_tree() service function with create/update/skip collision actions
  - CSVImportModal.jsx: 4-step wizard (Upload, Map Columns, Preview, Confirm)
  - "Import CSV" button in ExperimentSection header
  - experimentsApi.importCsv() frontend API method
affects:
  - 06-02 (table view for experiments — CSV import populates the data it will display)

# Tech tracking
tech-stack:
  added: [papaparse ^5.5.3 (CSV parsing in browser)]
  patterns:
    - BFS-ordered bulk creation ensures parent experiments are created before children
    - tmp_id → real_id map resolves import tree parent references during batch creation
    - Group column values propagated to both group nodes AND leaf configs for comparison-modal compatibility
    - Collision actions (create/update/skip) per item enable fine-grained conflict resolution

key-files:
  created:
    - frontend/src/pages/CSVImportModal.jsx
  modified:
    - backend/models/experiment.py
    - backend/services/experiment_service.py
    - backend/routers/experiments.py
    - frontend/src/services/api.js
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "Single-phase import (no parse-then-confirm roundtrip) — frontend builds the tree client-side from csvImportUtils before POSTing the final payload"
  - "BFS flatten guarantees parent-before-child ordering in the POST payload so server processes in correct order without needing to sort"
  - "Collision check only at root import level (parentTmpId===null) — nested imports under group nodes cannot collide with existing experiments since the groups are newly created"
  - "merge_metrics boolean passed at request level (not per-item) — one mode for the whole import"
  - "Preview tree resets fully when Back is pressed from Step 3 — avoids stale collision/rename state (research pitfall 2)"

patterns-established:
  - "Pattern: CSVImportModal uses resetTmpIdCounter() before each buildImportTree call for deterministic test/render IDs"
  - "Pattern: existingGroups computed in modal — experiments that have children are shown in parent picker"

requirements-completed: [CSV-01, CSV-02, CSV-03, CSV-04, CSV-05, CSV-06]

# Metrics
duration: 20min
completed: 2026-03-16
---

# Phase 6 Plan 01: CSV Import Wizard Summary

**Backend bulk-create endpoint + 4-step CSVImportModal wizard connecting PapaParse CSV parsing through column mapping and interactive tree preview to POST /api/projects/{project_id}/experiments/import-csv**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-16T23:40:00Z
- **Completed:** 2026-03-16T23:57:00Z
- **Tasks:** 2 (+ Plan 00 prerequisite verified)
- **Files modified:** 5 modified, 1 created

## Accomplishments

- Added ExperimentImportItem/Request/Result models to backend/models/experiment.py
- Implemented bulk_create_experiment_tree() with tmp_id→real_id mapping, create/update/skip collision actions, and merge_metrics support
- Added POST /api/projects/{project_id}/experiments/import-csv endpoint (201, project-scoped)
- Created CSVImportModal.jsx (532 lines) with full 4-step wizard: file upload + PapaParse, column mapping table with role dropdowns + group priority arrows, interactive tree preview with collision warnings/actions/rename/exclude, confirm + import with loading state and result summary
- Added "Import CSV" button with upload_file icon to ExperimentSection header
- All 19 utility tests pass; frontend build succeeds

## Task Commits

1. **Task 1: Backend bulk import endpoint** - `84acfb6` (feat)
2. **Task 2: CSVImportModal wizard + ProjectDetail wiring** - `e32690a` (feat)

## Files Created/Modified

- `backend/models/experiment.py` — Added ExperimentImportItem, ExperimentImportRequest, ExperimentImportResult models
- `backend/services/experiment_service.py` — Added bulk_create_experiment_tree() function
- `backend/routers/experiments.py` — Added POST /api/projects/{project_id}/experiments/import-csv endpoint
- `frontend/src/services/api.js` — Added experimentsApi.importCsv() method
- `frontend/src/pages/CSVImportModal.jsx` — Created: full 4-step wizard modal (532 lines)
- `frontend/src/pages/ProjectDetail.jsx` — Added CSVImportModal import, showCsvModal state, "Import CSV" button, modal render

## Decisions Made

- Single-phase import without parse-then-confirm roundtrip: frontend builds the complete tree client-side via csvImportUtils before posting the final BFS payload
- BFS flatten at Step 4 call time (not at Step 3 build time) so user renames/excludes applied last
- Collision detection at root import level only (not nested under group nodes)
- Preview tree state fully resets on Back from Step 3 to prevent stale collision/rename/exclude state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Executed Plan 00 prerequisite (csvImportUtils.js) before Plan 01**
- **Found during:** Pre-task analysis — csvImportUtils.js didn't exist yet
- **Issue:** Plan 01 depends on csvImportUtils.js from Plan 00 (never executed separately); existing commit `a439596` had already created the utility stubs but implementations were empty
- **Fix:** Replaced stubs with full implementations for all 7 utility functions; verified all 19 tests pass GREEN before proceeding to Plan 01 tasks
- **Files modified:** frontend/src/pages/csvImportUtils.js (full implementation), frontend/src/pages/ProjectDetail.csvimport.test.jsx (already existed with tests)
- **Verification:** `npm run test:run` — 19/19 tests pass
- **Committed in:** Prior commit `a439596` (already in history from partial run)

---

**Total deviations:** 1 auto-fixed (blocking prerequisite)
**Impact on plan:** Necessary to unlock Plan 01. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CSV import wizard is complete end-to-end; researchers can upload CSVs, map columns, preview trees, and bulk-create experiment hierarchies
- Plan 02 (table view for experiments) can now display the data imported via CSV
- Backend endpoint is fully functional; frontend wizard handles all collision resolution and merge modes

---
*Phase: 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design*
*Completed: 2026-03-16*
