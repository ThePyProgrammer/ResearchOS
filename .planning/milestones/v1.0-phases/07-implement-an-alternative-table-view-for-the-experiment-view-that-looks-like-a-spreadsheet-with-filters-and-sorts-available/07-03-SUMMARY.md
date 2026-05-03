---
phase: 07-experiment-table-view
plan: 03
subsystem: ui
tags: [react, filter, table, localStorage, dnd-kit, tailwind]

# Dependency graph
requires:
  - phase: 07-experiment-table-view-plan-02
    provides: ExperimentTableView with column management, inline editing, and sorting
provides:
  - Notion-style filter bar with FilterBar and FilterChip components
  - ExperimentDetailPanel side panel with config/metrics/notes/literature
  - Best-metric highlighting with per-metric lower-is-better toggle
  - filteredRows derived from filter state applied to sorted rows
  - Bulk actions (set status, duplicate, delete) for selected experiments
  - Config inheritance in table view via effectiveConfigMap
  - Sticky breadcrumb bar showing active section name
affects: [experiment-table-view, ProjectDetail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - FilterBar/FilterChip follow Notion-style chip pattern — chips show column+operator+value, click to open popover editor
    - Filter state persisted in localStorage with stale-filter cleanup via useEffect on allColumns change
    - Detail panel opened via row click (toggle), highlighted row with bg-blue-50/40
    - metricCellClass/getBestValue reused from CompareModal for best-metric highlighting in table view
    - effectiveConfigMap built at render time from parent→child cascade for config inheritance
    - Column drag constrained within groups using separate DnD context ID ('column-dnd')

key-files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "formatFilterValue helper renders human-readable chip value labels (array join, between range, empty string for empty/notempty operators)"
  - "lowerIsBetter toggle rendered as up/down pill inside SortableColumnHeader when highlightBest is true"
  - "Row click toggles detail panel (click same row again to close) to avoid requiring a separate close-only affordance"
  - "filteredRows replaces sortedRows throughout — select-all, metric highlighting, and new-row creation all work on filtered set"
  - "Config inheritance in table view via effectiveConfigMap — parent values cascade to child cells without DB changes"
  - "Status and Parent columns pinned before config/metric groups in column order"
  - "Bulk actions (set status, duplicate, delete) shared between tree and table views via same selectedIds state"
  - "Group separator borders used instead of colored group headers — less visual noise"
  - "Breadcrumb bar is sticky and shows active section name"

patterns-established:
  - "Filter architecture: filter state in localStorage, useEffect drops stale filters, filteredRows = sortRows | applyFilter chain"
  - "Detail panel pattern: flex outer container with flex-1 table and fixed-width panel, conditional rendering with transition class"
  - "Sticky layout: header + toolbar + table-head pinned via flex column; new-experiment row pinned at bottom with flex-shrink-0"

requirements-completed: [TABLE-06, TABLE-08, TABLE-11]

# Metrics
duration: multi-session (initial ~15min + extensive post-checkpoint fixes)
completed: 2026-03-18
---

# Phase 7 Plan 03: Filter Bar, Detail Panel, and Best-Metric Highlighting Summary

**Notion-style filter bar with 7 numeric operators, right-side experiment detail panel, best-metric highlighting, bulk actions, config inheritance, and ~24 post-checkpoint UX fixes delivering a polished spreadsheet table view — human verification approved**

## Performance

- **Duration:** Multi-session (Tasks 1-2 ~15 min initial implementation; then ~24 post-checkpoint fix commits before user approval)
- **Started:** 2026-03-17
- **Completed:** 2026-03-18
- **Tasks:** 3 (2 auto + 1 human-verify, approved)
- **Files modified:** 1 (frontend/src/pages/ProjectDetail.jsx)

## Accomplishments

- FilterBar with Add Filter button opening column picker, FilterChip components showing column/operator/value with edit popovers
- Status filter uses multi-select checkboxes for planned/running/completed/failed
- Numeric filters support 7 operators: equals, not-equals, greater-than, less-than, between, is-empty, is-not-empty
- Filter state persisted in localStorage per project; stale filters (from deleted columns) silently dropped on allColumns change
- ExperimentDetailPanel opens on row click with config KVEditor, metrics KVEditor, status dropdown, notes toggle, and literature linking
- Best-metric toggle in toolbar with per-metric lower-is-better toggle pills in column headers; metric cells highlighted using same metricCellClass/getBestValue logic as CompareModal
- Post-checkpoint: config inheritance via effectiveConfigMap, bulk actions (set status / duplicate / delete), sticky breadcrumb bar, sticky checkbox column, opaque column headers, edge-to-edge table layout, flex-shrink-0 new-experiment bar, group separator borders, status/parent columns pinned first, view toggle height normalised
- Human verification approved after all post-checkpoint fixes were applied

## Task Commits

1. **Task 1: Filter bar with Notion-style chips** - `894dea0` (feat — combined with Task 2)
2. **Task 2: Row detail side panel + best-metric highlighting** - `894dea0` (feat)
3. **Task 3: Human verification** - Approved after post-checkpoint fix commits below

**Post-checkpoint fix commits (applied after initial implementation, before user approval):**
- `22193ec` fix(07-03): use flex layout for detail panel, remove fixed positioning
- `86c4250` fix(07-03): standardise padding — header stretches full width in both views
- `9ebbccf` fix(07-03): widen tree view from max-w-2xl to max-w-4xl
- `6ee7d32` fix(07-03): fix filter property name mismatch (column vs columnId)
- `2fab161` fix(07-03): remove Created column from experiment table view
- `ed3f6c3` feat(07-03): config inheritance in table view — parent values cascade
- `23f98e1` fix(07-03): merge filter bar, highlight toggle, and columns button into one row
- `58d0144` fix(07-03): table stretches full width, no inline scroll
- `ee1e8f6` fix(07-03): center checkboxes in table header and body rows
- `3127c7d` fix(07-03): fix Name column overlapping Status — remove sticky positioning
- `a025fa9` fix(07-03): sticky breadcrumb, horizontal table scroll
- `893fc5a` fix(07-03): table edge-to-edge — remove padding, borders, rounded corners
- `4770c3f` fix(07-03): sticky bottom new-experiment bar
- `0820614` fix(07-03): pin header, toolbar, table head to top + new-row to bottom
- `0c0a82c` fix(07-03): use flex-1 instead of hardcoded calc for table view height
- `863a959` fix(07-03): measure available height with ref for table view container
- `cbbd7ee` fix(07-03): make table header backgrounds fully opaque
- `51ab35b` fix(07-03): sticky checkbox column on horizontal scroll
- `8dcefa2` feat(07-03): bulk actions — set status, duplicate, delete for selected experiments
- `ecb7e4d` fix(07-03): bulk action bar below toolbar in table view
- `650fef5` fix(07-03): replace colored headers with group separator borders
- `443151d` fix(07-03): pin status and parent columns before config/metric groups
- `199b4e4` fix(07-03): normalise view toggle height to match adjacent buttons
- `55af023` feat: breadcrumb shows active section (Experiments, Literature, Notes)

## Files Created/Modified

- `frontend/src/pages/ProjectDetail.jsx` - Added formatFilterValue, FilterChip, FilterBar, ExperimentDetailPanel components; updated ExperimentTableView with filter/detail/highlight state and effectiveConfigMap; updated SortableColumnHeader with lowerIsBetter toggle; bulk actions; layout overhaul; sticky breadcrumb

## Decisions Made

- filteredRows replaces sortedRows throughout — consistent behavior for select-all, metric best-value computation, new-row creation
- Row click toggles detail panel (same row click closes) — avoids requiring a separate close-only affordance
- Config inheritance via effectiveConfigMap computed at render time — no DB changes, matches CompareModal's getEffectiveConfig() pattern
- Status and Parent columns pinned before config/metric column groups so they are always visible
- Bulk actions shared between tree and table views via same selectedIds state
- Group separator borders instead of colored headers for cleaner visual separation
- Sticky breadcrumb bar for spatial orientation (Projects > Study > Experiments)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed filter property name mismatch (column vs columnId)**
- **Found during:** Post-Task 2 review (human-verify debugging)
- **Issue:** applyFilter expected `filter.columnId` but FilterBar created filters with `filter.column` — all filters were silently no-ops
- **Fix:** Standardised to `filter.column` across FilterBar, FilterChip, and applyFilter
- **Files modified:** frontend/src/pages/ProjectDetail.jsx
- **Committed in:** 6ee7d32

**2. [Rule 1 - Bug] Removed Created column (not stored in DB)**
- **Found during:** Post-Task 2 review (human-verify feedback)
- **Issue:** Created column appeared in table but experiments have no `created_at` field in the API response, so cells were always empty
- **Fix:** Removed the column definition from buildColumns
- **Files modified:** frontend/src/pages/ProjectDetail.jsx
- **Committed in:** 2fab161

**3. [Rule 2 - Missing Critical] Added config inheritance via effectiveConfigMap**
- **Found during:** Post-Task 2 review (human-verify review)
- **Issue:** Child experiments with inherited config from parents showed empty config cells in table view
- **Fix:** Built effectiveConfigMap at render time using parent→child cascade, applied in table cell rendering
- **Files modified:** frontend/src/pages/ProjectDetail.jsx
- **Committed in:** ed3f6c3

**4. [Rule 1 - Bug] Fixed detail panel fixed positioning breaking layout**
- **Found during:** Post-Task 2 (human-verify feedback)
- **Issue:** Detail panel used fixed positioning that overlapped content instead of pushing table to the left
- **Fix:** Switched to flex-based layout with flex-shrink-0 panel and max-w calculation on table container
- **Files modified:** frontend/src/pages/ProjectDetail.jsx
- **Committed in:** 22193ec

**5. [Rule 1 - Bug] Fixed Name column overlapping Status via sticky z-index conflict**
- **Found during:** Post-Task 2 debugging
- **Issue:** Sticky Name column z-index conflicted with Status column making status badge unclickable
- **Fix:** Removed sticky positioning from Name column, kept only checkbox column sticky
- **Files modified:** frontend/src/pages/ProjectDetail.jsx
- **Committed in:** 3127c7d

---

**Total deviations:** 5 auto-fixed bugs/missing-critical + ~19 additional layout/UX improvement commits applied post-checkpoint
**Impact on plan:** All fixes necessary for correctness and usability. The volume of post-checkpoint fixes reflects the complexity of getting a full-featured spreadsheet layout right — sticky headers, horizontal scroll, collapsible side panel, and a pinned bottom row all interact.

## Issues Encountered

- Table layout in a flex container with sticky headers, horizontal scroll, a sticky bottom new-row, AND a collapsible side panel required many incremental corrections — each fix revealed the next layout constraint
- Column drag DnD context required a separate context ID ('column-dnd') to avoid interfering with experiment tree DnD
- React's `indeterminate` prop limitation required useRef + useEffect pattern for the select-all checkbox (same pattern used elsewhere in the codebase)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 12 TABLE requirements addressed across plans 07-00 through 07-03
- Experiment table view is fully functional and polished; human verification approved
- Phase 7 is complete
- No follow-on phases currently planned

## Self-Check: PASSED

- `frontend/src/pages/ProjectDetail.jsx` modified: CONFIRMED (git log shows 894dea0 + 24 subsequent fix commits)
- Human verification: APPROVED by user after all post-checkpoint fixes applied
- Requirements completed: TABLE-06, TABLE-08, TABLE-11

---
*Phase: 07-experiment-table-view*
*Completed: 2026-03-18*
