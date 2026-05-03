---
phase: 07-experiment-table-view
plan: 02
subsystem: ui
tags: [react, table-view, column-picker, dnd-kit, inline-editing, localStorage]

requires:
  - phase: 07-01
    provides: ExperimentTableView base component with sorting, sticky columns, and view toggle

provides:
  - ColumnPicker component (show/hide columns + Reset button)
  - SortableColumnHeader with horizontal DnD reorder via @dnd-kit
  - Column resize via drag handle on each column header right edge
  - '+' button at end of column headers to add custom config/metric columns
  - Column state (visibility, order, widths, custom columns) persisted in localStorage
  - EditableCell for double-click inline editing of name, config, and metric cells
  - ExperimentStatusDropdown inline in status column for single-click status changes
  - Inline new row at bottom of table for quick experiment creation

affects:
  - 07-03 (detail panel integration in table view)

tech-stack:
  added:
    - horizontalListSortingStrategy from @dnd-kit/sortable (already installed)
  patterns:
    - "Separate DndContext (id='column-dnd') for column headers vs tree view DnD — no collision"
    - "useSortable only on reorderable columns (not type_icon/name) so fixed columns stay anchored"
    - "EditableCell uses detectType(draft) on save to preserve numeric/boolean values"
    - "colState.customColumns array tracks user-added columns not present in data"

key-files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "ColumnPicker closes on outside click via document mousedown listener in useEffect"
  - "Resize handle uses document-level mousemove/mouseup — no React state during drag, only writes to colState.widths on mouseup"
  - "SortableColumnHeader renders grip icon with listeners/attributes — sort click on label area not affected by DnD"
  - "customColumns in colState allows showing columns before any experiment has that key in data"
  - "EditableCell onSave only called when parsed value !== original value — avoids spurious API calls"
  - "Inline new row uses Enter to submit and Escape to clear — red text briefly on validation error"
  - "Status cell wraps ExperimentStatusDropdown directly — no EditableCell abstraction needed"

patterns-established:
  - "Separate DnD context ID ('column-dnd') from tree view context prevents drag event conflicts"
  - "colState shape: { order: string[], hidden: string[], widths: {}, customColumns: [] }"

requirements-completed:
  - TABLE-04
  - TABLE-07
  - TABLE-10

duration: 4min
completed: 2026-03-17
---

# Phase 7 Plan 02: Column Management + Inline Editing Summary

**ColumnPicker, horizontal DnD column reorder, column resize, custom column add, EditableCell inline editing, and inline new row row added to ExperimentTableView**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T16:50:56Z
- **Completed:** 2026-03-16T16:54:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Implemented ColumnPicker component with show/hide checkboxes per column and Reset to defaults
- Added SortableColumnHeader for horizontal DnD column reorder using horizontalListSortingStrategy in a separate DnD context
- Added column resize via drag handle on each column header right edge (document-level mouse tracking)
- Added '+' button at end of column headers opening a two-step popover (type -> key name) to add custom config/metric columns
- All column state (visibility, order, widths, custom columns) persists in localStorage under `researchos.exp.table.cols.{projectId}`
- EditableCell component for double-click inline editing (Enter saves, Escape cancels) used in name, config, and metric cells
- Status column renders ExperimentStatusDropdown inline for single-click status changes
- Inline new row at bottom of table creates experiments on Enter with trimmed name validation

## Task Commits

Each task was committed atomically:

1. **Tasks 1 + 2: Column management + EditableCell + inline new row** - `28238f2` (feat)

## Files Created/Modified
- `frontend/src/pages/ProjectDetail.jsx` - Added ColumnPicker, SortableColumnHeader, EditableCell components; rewrote ExperimentTableView with full column management, inline editing, and inline new row

## Decisions Made
- Used a separate DndContext with `id="column-dnd"` for column headers to avoid collision with the tree view's DnD context (the tree DnD is only rendered when viewMode='tree' anyway, but the explicit id is defensive)
- SortableColumnHeader only attaches DnD listeners to the grip icon, not the entire header — so clicking the label area still triggers sort
- Column resize uses document-level mousemove/mouseup to avoid losing the resize gesture on fast mouse moves; width written to colState.widths on mouseup only
- customColumns in colState tracks user-added columns that have no matching data key yet — merged with buildColumns output so they appear even when empty
- EditableCell calls detectType(draft) on save so string "3.5" becomes number 3.5 matching the existing CSV import convention

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Column management and inline editing are complete
- Plan 03 can add row click to open detail panel (ExperimentNode panel) from the table view

## Self-Check

- [x] `frontend/src/pages/ProjectDetail.jsx` modified — confirmed
- [x] Commit `28238f2` exists — confirmed
- [x] All 78 tests GREEN — confirmed

## Self-Check: PASSED

---
*Phase: 07-experiment-table-view*
*Completed: 2026-03-17*
