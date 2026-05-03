---
phase: 07-experiment-table-view
plan: 01
subsystem: ui
tags: [react, table-view, sorting, sticky-columns, localStorage]

requires:
  - phase: 07-00
    provides: useLocalStorage hook extracted, table view test scaffolds in RED state

provides:
  - ExperimentTableView component with sticky header + name column
  - buildColumns/applyFilter/sortRows/getCellValue exported pure helpers
  - View toggle (tree/table icons) in ExperimentSection header
  - localStorage persistence of view mode per project
  - Shared selectedLeafIds selection working across both views

affects:
  - 07-02 (filter bar will be added to ExperimentTableView)
  - 07-03 (detail panel integration in table view)

tech-stack:
  added: []
  patterns:
    - "buildColumns/applyFilter/sortRows exported from page component for unit testability"
    - "Conditional render pattern: viewMode === 'table' ? <ExperimentTableView> : <DndContext tree>"
    - "Sticky layout via CSS sticky + z-index layering (checkbox z-30, name column z-30, other headers z-20, body cells z-10)"

key-files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "applyFilter signature is (exp, filter) with filter.columnId — matches test contract from 07-00 RED scaffolds"
  - "sortRows signature is (rows, sort) with sort.columnId — same pattern for consistency"
  - "getCellValue treats 'parent' column as returning _parentId when parentMap is null (sort path) vs parentName when Map given (render path)"
  - "View toggle placed between h2 and action buttons — natural grouping, doesn't crowd the action area"
  - "ExperimentTableView handles select-all via indeterminate ref callback (React does not support indeterminate as controlled prop)"

patterns-established:
  - "Column type 'config' gets bg-blue-50/60, type 'metric' gets bg-emerald-50/60 for visual distinction"
  - "Sort cycles: null -> asc -> desc -> null (third click clears)"
  - "Nulls always sort last regardless of direction"

requirements-completed:
  - TABLE-01
  - TABLE-02
  - TABLE-03
  - TABLE-05
  - TABLE-09
  - TABLE-12

duration: 8min
completed: 2026-03-17
---

# Phase 7 Plan 01: Experiment Table View — Core Component Summary

**Spreadsheet-like ExperimentTableView with sticky header+name column, blue/green color-coded config/metric headers, sortable columns, select-all checkboxes, and localStorage view toggle shared with the existing tree view**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-17T00:41:00Z
- **Completed:** 2026-03-17T00:49:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Implemented and exported `buildColumns`, `applyFilter`, `sortRows`, `getCellValue` pure helpers — all 26 RED unit tests now GREEN
- Built `ExperimentTableView` component with sticky checkbox+header row, sticky name column, sortable column headers with directional icons, config headers in blue and metric headers in green
- Added view toggle (tree/table icon buttons) to ExperimentSection header with `useLocalStorage` persistence per project
- Selection state (`selectedLeafIds`, `handleToggleNode`) shared identically between tree and table views — switching views preserves selection

## Task Commits

Each task was committed atomically:

1. **Tasks 1 + 2: Helper functions + ExperimentTableView + view toggle** - `474eaa0` (feat)

## Files Created/Modified
- `frontend/src/pages/ProjectDetail.jsx` - Added buildColumns/applyFilter/sortRows/getCellValue exports, ExperimentTableView component, useLocalStorage import, viewMode state, view toggle UI in ExperimentSection header, conditional render of tree vs table

## Decisions Made
- The `applyFilter(exp, filter)` and `sortRows(rows, sort)` signatures match the contract from 07-00 RED test scaffolds exactly — no deviation needed
- `getCellValue` resolves `parent` column to `_parentId` when no parentMap is provided (sort path), and to parent name when a Map is provided (future render path for plan 02+)
- Select-all checkbox uses `useRef` + `useEffect` to set `indeterminate` directly on the DOM element — React does not support indeterminate as a controlled prop

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Table view foundation is complete and all Wave 0 tests pass
- Plan 02 can add column picker and filter bar to ExperimentTableView (visibleColumns already factored out)
- Plan 03 can add inline cell editing and row click to open detail panel

## Self-Check

- [x] `frontend/src/pages/ProjectDetail.jsx` modified — confirmed
- [x] Commit `474eaa0` exists — confirmed via `git rev-parse --short HEAD`
- [x] All 26 table view tests GREEN
- [x] Full suite 78/78 passing

## Self-Check: PASSED

---
*Phase: 07-experiment-table-view*
*Completed: 2026-03-17*
