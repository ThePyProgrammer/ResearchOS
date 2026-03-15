---
phase: 02-research-questions-literature
plan: 05
subsystem: ui
tags: [react, dnd-kit, drag-and-drop, research-questions]

# Dependency graph
requires:
  - phase: 02-research-questions-literature
    provides: "@dnd-kit DnD reparenting for RQ tree from plan 02-04"
provides:
  - Root-onto-root drag demote via pointer-position heuristic (middle 50% = nest, edges = reorder)
  - Visual nest-mode highlight on target RQ node during drag hover
  - data-rq-id attribute on RQNode for DOM bounding rect lookup
affects: [02-research-questions-literature]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pointer-position zone heuristic for DnD: middle 50% = drop-onto (nest), top/bottom 25% = drop-between (reorder)"
    - "useRef for drag state that shouldn't trigger re-renders (lastPointerY)"
    - "onDragMove handler for incremental pointer tracking during @dnd-kit drag"

key-files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx

key-decisions:
  - "Middle 50% of target height = 'nest' zone; top/bottom 25% = 'reorder' zone — matches common DnD nesting conventions"
  - "lastPointerY tracked via ref (not state) to avoid re-renders on every mouse move during drag"
  - "dropTarget state drives visual feedback (blue ring) — cleared on dragEnd and dragCancel"
  - "Dead code (root-onto-root fallback in Case 2) removed — was unreachable and confusing"
  - "Childless constraint reused for demote path (same as cross-parent reparent)"

patterns-established:
  - "Zone heuristic: top 25% / middle 50% / bottom 25% split for nest-vs-reorder DnD UX"

requirements-completed:
  - RQ-06

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 2 Plan 5: Root-onto-Root RQ Demote Summary

**Pointer-position zone heuristic in @dnd-kit handleDragEnd that demotes a childless root RQ to a sub-question when dragged onto the center (middle 50%) of another root RQ, with blue ring visual feedback during hover**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T12:03:57Z
- **Completed:** 2026-03-15T12:05:46Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Root RQ can now be dragged onto another root RQ's center zone to demote it as a sub-question
- Dropping near the top/bottom 25% edges still performs sibling reorder (no behavior change)
- Visual blue ring highlight on target node when pointer is in the "nest" zone during drag
- Removed dead/confusing fallback branch in Case 2 (root-onto-root path that was already caught by Case 1)
- All previously working DnD operations preserved: sub-to-root promotion, cross-parent reparent, childless constraint

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pointer-position heuristic to distinguish root reorder from root demote** - `faebd26` (feat)

**Plan metadata:** *(pending — docs commit)*

## Files Created/Modified
- `frontend/src/pages/ProjectDetail.jsx` - Added lastPointerY ref, dropTarget state, handleDragMove handler, root-onto-root nest detection in Case 1, data-rq-id attribute on RQNode, visual nest highlight, removed dead code in Case 2

## Decisions Made
- Middle 50% of target height chosen as the "nest" zone — consistent with common DnD nesting UX (e.g., Notion, Linear)
- `lastPointerY` stored as a ref rather than state to avoid re-renders on every mouse-move event during drag
- `dropTarget` state used for visual feedback (blue ring) — cleared on both `dragEnd` and `dragCancel`
- Dead root-onto-root fallback in Case 2 removed — it was unreachable and contradicted the new Case 1 logic

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written. Visual feedback (optional nice-to-have from the plan) was implemented since it was straightforward, consistent with the plan's suggestion.

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** None — executed exactly as specified.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RQ-06 (full drag-and-drop rearrangement) is now complete
- Phase 02 is fully complete with all 5 plans delivered
- Ready for Phase 03 (Experiments)

---
*Phase: 02-research-questions-literature*
*Completed: 2026-03-15*

## Self-Check: PASSED
- ✅ `02-05-SUMMARY.md` exists on disk
- ✅ Task commit `faebd26` exists in git log
