---
phase: 02-research-questions-literature
plan: "02"
subsystem: ui
tags: [react, research-questions, tree-ui, inline-edit, recursive-components]

# Dependency graph
requires:
  - phase: 02-01
    provides: researchQuestionsApi (list/create/update/remove) in api.js and backend RQ endpoints
provides:
  - RQ tree UI on ProjectDetail Overview tab (RQSection, RQNode, AddRQInput, RQStatusDropdown)
  - Recursive expand/collapse tree with inline editing, status badges, hypothesis, and delete
affects:
  - 02-03 (drag-and-drop reorder will layer on top of RQNode)
  - 03-experiments (Experiments section placeholder already visible below RQ section)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useCallback wraps fetchRqs so it can be passed as onRefresh without stale closure"
    - "useMemo derives tree from flat RQ list; fetch stores flat, tree is computed view"
    - "useEffect with document mousedown listener closes context menus on outside click"
    - "depth * 24px paddingLeft drives recursive indentation without nested wrappers"

key-files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "Children rendered at depth=0 inside expanded RQNode (indentation managed by paddingLeft on outer div, not by passing depth+1 recursively) — simplifies layout, avoids double-padding compounding"
  - "onRefresh re-fetches full flat list from API after any mutation — simple and correct for v1, no optimistic state"
  - "RQStatusDropdown uses native <select> styled as pill (same pattern as project StatusDropdown) — consistent with existing UI, no custom dropdown complexity"
  - "Drag handle icon (drag_indicator) shown on hover but not yet functional — visual affordance for Plan 03 DnD"

patterns-established:
  - "Inline editing: click text to activate input, Enter to save, Escape to cancel, onBlur commits if non-empty"
  - "Three-dot context menus: useRef + document mousedown listener for outside-click close"

requirements-completed: [RQ-01, RQ-02, RQ-03, RQ-04, RQ-06]

# Metrics
duration: 7min
completed: 2026-03-15
---

# Phase 2 Plan 02: Research Questions Tree UI Summary

**Recursive RQ tree with inline create/edit/status/hypothesis/delete on ProjectDetail Overview tab, wired to researchQuestionsApi**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-15T08:45:20Z
- **Completed:** 2026-03-15T08:52:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced Phase 2 placeholder div with working RQSection component that fetches and renders the full RQ tree
- Implemented recursive RQNode component with expand/collapse, inline question editing, status badge dropdown, hypothesis add/edit, and three-dot delete menu with cascade confirmation
- Added AddRQInput component for creating primary RQs and sub-questions with Enter-to-submit and Escape-to-cancel
- Build passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Build RQ tree components and integrate into OverviewTab** - `56a1409` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `frontend/src/pages/ProjectDetail.jsx` - Added buildRqTree, rqStatusConfig, RQStatusDropdown, AddRQInput, RQNode, RQSection; wired RQSection into OverviewTab; removed Phase 2 Research Questions sidebar item (now live)

## Decisions Made
- Children rendered at depth=0 inside parent RQNode's expanded area with paddingLeft indentation on the outer div, rather than passing depth+1 recursively — avoids compounding padding and simplifies the layout
- onRefresh always re-fetches the full flat list from the API (no optimistic state) — simple and correct for v1
- Drag handle icon shown on hover in slate-300 as visual affordance but not functional — DnD comes in Plan 03

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RQ tree is fully functional; Plan 03 can add drag-and-drop reorder by wiring the drag_indicator handle to react-dnd or dnd-kit
- The "Research Questions" sidebar item in the "Coming Soon" section was removed (it now works), leaving only "Experiments" as a future item

---
*Phase: 02-research-questions-literature*
*Completed: 2026-03-15*
