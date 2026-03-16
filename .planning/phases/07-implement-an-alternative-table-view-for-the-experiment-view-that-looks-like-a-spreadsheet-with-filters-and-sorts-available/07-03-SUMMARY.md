---
phase: 07-experiment-table-view
plan: 03
subsystem: ui
tags: [react, filter, table, localStorage, dnd-kit]

# Dependency graph
requires:
  - phase: 07-experiment-table-view-plan-02
    provides: ExperimentTableView with column management, inline editing, and sorting
provides:
  - Notion-style filter bar with FilterBar and FilterChip components
  - ExperimentDetailPanel side panel with config/metrics/notes/literature
  - Best-metric highlighting with per-metric lower-is-better toggle
  - filteredRows derived from filter state applied to sorted rows
affects: [experiment-table-view, ProjectDetail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - FilterBar/FilterChip follow Notion-style chip pattern — chips show column+operator+value, click to open popover editor
    - Filter state persisted in localStorage with stale-filter cleanup via useEffect on allColumns change
    - Detail panel opened via row click (toggle), highlighted row with bg-blue-50/40
    - metricCellClass/getBestValue reused from CompareModal for best-metric highlighting in table view

key-files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "formatFilterValue helper renders human-readable chip value labels (array join, between range, empty string for empty/notempty operators)"
  - "lowerIsBetter toggle rendered as ↑/↓ pill inside SortableColumnHeader when highlightBest is true — no separate prop drilling required"
  - "Row click toggles detail panel (click same row again to close) to avoid requiring a separate close-only affordance"
  - "filteredRows replaces sortedRows throughout — select-all, metric highlighting, and new-row creation all work on filtered set"
  - "ExperimentDetailPanel Notes section uses Show/Hide toggle to avoid eager loading — fetches only when opened"

patterns-established:
  - "Filter architecture: filter state in localStorage, useEffect drops stale filters, filteredRows = sortRows | applyFilter chain"
  - "Detail panel pattern: flex outer container with flex-1 table and fixed-width panel, conditional rendering with transition class"

requirements-completed: [TABLE-06, TABLE-08, TABLE-11]

# Metrics
duration: 15min
completed: 2026-03-17
---

# Phase 7 Plan 03: Filter Bar, Detail Panel, and Best-Metric Highlighting Summary

**Notion-style filter bar with 7 numeric operators and status multi-select, right-side experiment detail panel, and best-metric cell highlighting completing the spreadsheet table view**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-17T01:00:00Z
- **Completed:** 2026-03-17T01:15:00Z
- **Tasks:** 2 auto tasks complete, 1 checkpoint awaiting human verification
- **Files modified:** 1

## Accomplishments
- FilterBar with Add Filter button that opens column picker, FilterChip components showing column/operator/value
- Status filter uses multi-select checkboxes for planned/running/completed/failed
- Numeric filters support 7 operators: equals, not-equals, greater-than, less-than, between, is-empty, is-not-empty
- Filter state persisted in localStorage per project; stale filters (from deleted columns) silently dropped
- ExperimentDetailPanel opens on row click with config KVEditor, metrics KVEditor, status dropdown, notes toggle, and literature linking
- Best-metric toggle in toolbar with per-metric lower-is-better toggle pills in column headers
- Metric cells highlighted using same metricCellClass logic as CompareModal

## Task Commits

1. **Task 1 + 2: Filter bar, detail panel, best-metric highlighting** - `894dea0` (feat)

## Files Created/Modified
- `frontend/src/pages/ProjectDetail.jsx` - Added formatFilterValue, FilterChip, FilterBar, ExperimentDetailPanel components; updated ExperimentTableView with filter/detail/highlight state; updated SortableColumnHeader with lowerIsBetter toggle; updated ExperimentSection to pass expPapersMap/rqList to ExperimentTableView

## Decisions Made
- Filter chip edit popovers use `useEffect` + outside-click pattern (same as other dropdowns in codebase)
- Toggling the same row closes the detail panel (acts like a toggle, no separate close button needed in the row)
- `filteredRows` replaces `sortedRows` throughout — consistent behavior for select-all, metric best-value computation, new-row creation

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were implemented together in a single commit since they both touched the same file and had tight dependencies.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The experiment table view is now feature-complete: toggle between tree/table, column management, sorting, filtering, inline editing, detail panel, best-metric highlighting
- All 12 TABLE requirements addressed across plans 00-03
- Pending: human verification checkpoint (Task 3) to confirm end-to-end UX

## Self-Check: PASSED
- `frontend/src/pages/ProjectDetail.jsx` modified: CONFIRMED (git log shows 894dea0)
- Build: PASSED (npx vite build succeeded)
- Tests: PASSED (78/78 tests pass)

---
*Phase: 07-experiment-table-view*
*Completed: 2026-03-17*
