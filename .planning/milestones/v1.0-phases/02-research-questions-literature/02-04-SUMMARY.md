---
phase: 02-research-questions-literature
plan: 04
subsystem: ui
tags: [react, dnd-kit, drag-and-drop, research-questions, sortable]

# Dependency graph
requires:
  - phase: 02-research-questions-literature
    provides: RQ tree with inline CRUD, status badges, hypothesis fields, Literature tab, per-RQ paper linking
provides:
  - Drag-and-drop reparenting and reordering of RQ tree using @dnd-kit
  - Sibling reorder within same parent level
  - Cross-parent reparenting (promote sub-Q to root, demote root to sub-Q, move between parents)
  - Childless constraint enforcement (items with sub-questions cannot be reparented)
  - DragOverlay floating card preview during drag
  - Fix: RQ creation 422 (project_id set authoritatively from URL path param server-side)
  - Fix: GitHub repo project linking support
  - Fix: LiteratureTab search pickers filtered by project library_id
affects:
  - 03-experiments-tracking

# Tech tracking
tech-stack:
  added:
    - "@dnd-kit/core: DndContext, DragOverlay, PointerSensor, collision detection"
    - "@dnd-kit/sortable: SortableContext, useSortable, arrayMove, verticalListSortingStrategy"
    - "@dnd-kit/utilities: CSS transform helper"
  patterns:
    - "PointerSensor with activationConstraint distance:5 to prevent accidental drags on click"
    - "useSortable listeners placed on drag handle icon only — click targets (question text, status dropdown) remain interactive"
    - "Flat tree array with _parentId metadata used for SortableContext item IDs"
    - "Same-parent drop = sibling reorder via arrayMove + reorder API; different-parent drop = reparent via update API"
    - "Childless constraint: items with children silently abort on cross-parent drop with console.warn"

key-files:
  created: []
  modified:
    - "frontend/package.json: added @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities"
    - "frontend/src/pages/ProjectDetail.jsx: DndContext wrap of RQSection, useSortable in RQNode, onDragEnd handler, DragOverlay"

key-decisions:
  - "PointerSensor activationConstraint distance:5 prevents accidental drag on click/tap interactions"
  - "useSortable listeners on drag handle icon only — all other row interactions remain clickable"
  - "flattenRqTree helper produces _parentId metadata needed for distinguishing sibling reorder vs reparent in onDragEnd"
  - "Same-parent detection: compare _parentId of dragged and target nodes to route to reorder vs reparent path"
  - "Childless constraint enforced in onDragEnd before API call — no visual warning, just silent abort + console.warn"
  - "DragOverlay is a floating card (shadow-lg, bg-white, rounded-lg) showing question text + status badge"

patterns-established:
  - "DnD: always put listeners on the handle element only, never on the entire row"
  - "DnD: flattenRqTree produces parentId metadata for the DnD engine without altering the tree data model"
  - "DnD: optimistic position update for sibling reorder with fetchRqs() reconciliation after API call"

requirements-completed:
  - RQ-06

# Metrics
duration: 10min
completed: 2026-03-15
---

# Phase 02 Plan 04: DnD Reparenting for RQ Tree Summary

**@dnd-kit drag-and-drop added to RQ tree: sibling reorder, cross-parent reparenting, promote/demote, childless constraint, and floating DragOverlay**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-15T09:02:11Z
- **Completed:** 2026-03-15T09:12:00Z
- **Tasks:** 2 of 2 (Task 1 auto + Task 2 human-verify — approved with fixes)
- **Files modified:** 3 (+ backend and frontend fixes at checkpoint)

## Accomplishments
- Installed @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities (5 packages)
- Wrapped RQSection tree in DndContext with PointerSensor (5px activation distance)
- Made every RQNode a sortable item; drag handle icon (drag_indicator) carries the listeners
- Implemented onDragEnd with two paths: same-parent sibling reorder and cross-parent reparent
- Enforced childless constraint — items with children cannot be reparented
- DragOverlay shows floating card with question text and status badge during drag
- Build succeeds with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @dnd-kit and implement DnD reparenting for RQ tree** - `220ba76` (feat)
2. **Task 2: Human verification — approved with fixes:**
   - `7c11f56` — fix RQ creation 422 + GitHub repo project linking (fix)
   - `04512ee` — filter search pickers by project library_id (fix)

## Files Created/Modified
- `frontend/package.json` — added @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
- `frontend/package-lock.json` — updated lockfile
- `frontend/src/pages/ProjectDetail.jsx` — DndContext wrap, useSortable in RQNode, onDragEnd handler, DragOverlay, flattenRqTree helper

## Decisions Made
- Placed drag listeners on the `drag_indicator` icon span only, not the entire row — preserves click-to-edit on question text and dropdown interactions
- `flattenRqTree` produces `_parentId` on each node so the DnD handler can distinguish same-parent reorder from cross-parent reparent without querying the tree structure again
- Childless constraint is a silent abort (console.warn only) — no visual error toast for v1 simplicity
- DragOverlay shows question text + status badge in a floating white card with shadow

## Deviations from Plan

### Auto-fixed Issues (found during Task 2 human verification)

**1. [Rule 1 - Bug] Fixed RQ creation 422 error**
- **Found during:** Task 2 (human verification checkpoint)
- **Issue:** Creating a new research question from ProjectDetail returned HTTP 422; project_id was not being forwarded correctly to the backend
- **Fix:** Server-side fix to use project_id from URL path param as the authoritative value, overriding body project_id
- **Committed in:** `7c11f56`

**2. [Rule 2 - Missing Critical] Added GitHub repo project linking support**
- **Found during:** Task 2 (human verification checkpoint)
- **Issue:** GitHub repo items could not be linked to projects via the LinkToProjectButton flow
- **Fix:** Extended project linking logic to handle the GitHub repo item type
- **Committed in:** `7c11f56`

**3. [Rule 1 - Bug] Fixed search pickers showing cross-library results**
- **Found during:** Task 2 (human verification checkpoint)
- **Issue:** LiteratureTab search picker showed papers/websites from all libraries instead of filtering to the project's library
- **Fix:** Passed library_id filter to search API calls in SearchPicker component
- **Committed in:** `04512ee`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All three fixes necessary for correctness — RQ creation was broken, GitHub linking was missing, and search was showing cross-library contamination. No scope creep.

## Issues Encountered
None beyond the three bugs caught and fixed during verification. @dnd-kit installed cleanly and the build passed on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 02 fully complete and verified: RQ CRUD, status badges, hypothesis, Literature tab, per-RQ paper/website linking, gap indicators, DnD reorder/reparent all implemented and confirmed working
- All 10 human verification steps passed (RQ CRUD, delete cascade, expand/collapse, Literature linking, gap indicators, all 4 DnD operations, Paper/Website bidirectional linking)
- Phase 03: Experiments tracking — can use the RQ tree as a foundation for linking experiments to RQs

---
*Phase: 02-research-questions-literature*
*Completed: 2026-03-15*
