---
phase: 02-research-questions-literature
verified: 2026-03-15T12:15:00Z
status: passed
score: 15/15 must-haves verified
re_verification: true
previous_verification:
  status: gaps_found
  score: 14/15
  verified: 2026-03-15T10:30:00Z
  gaps_closed:
    - "User can drag a childless primary RQ onto another primary to make it a sub-question (root-onto-root demote via pointer-Y heuristic — commit faebd26)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Verify expand/collapse, hypothesis, and three-dot delete menu in browser"
    expected: "All inline interactions work correctly — click-to-edit question, Enter to save, Escape to cancel, status dropdown, hypothesis add/edit/clear, delete with cascade confirmation"
    why_human: "Interactive UI state flows cannot be verified without a running browser"
  - test: "Verify Literature tab search picker and linking in browser"
    expected: "Searching returns results from the correct library (filtered by libraryId), already-linked items show checkmark, linking adds to table, unlink removes it"
    why_human: "SearchPicker debouncing, dropdown positioning, and library filter require live API and browser"
  - test: "Verify gap indicator appears and clears correctly"
    expected: "RQs with no linked papers show warning_amber icon; after linking a paper to an RQ, the icon disappears"
    why_human: "Depends on live rqPapersMap state updates after linking"
  - test: "Verify root-onto-root demote in browser — center drop nests, edge drop reorders"
    expected: "Dragging childless primary RQ A onto the center body of primary RQ B makes A a sub-question of B. Dragging A near the top/bottom edge of B causes sibling reorder. Visual blue ring appears on B when pointer is in the nest zone."
    why_human: "DnD pointer simulation requires live browser; zone split (middle 50% / edge 25%) depends on element bounding rects at runtime"
  - test: "Verify childless constraint still blocks demote in browser"
    expected: "Dragging a primary RQ that has sub-questions and hovering its center over another primary RQ produces no reparent (console.warn only, no API call)"
    why_human: "Requires browser interaction to trigger the constraint path"
---

# Phase 2: Research Questions & Literature Verification Report

**Phase Goal:** Build hierarchical research questions, project-paper linking, and drag-and-drop RQ tree management
**Verified:** 2026-03-15T12:15:00Z
**Status:** human_needed — all automated checks pass; 5 items require live browser confirmation
**Re-verification:** Yes — after gap closure in plans 02-05 and 02-06

---

## Re-verification Summary

| | Previous (2026-03-15T10:30:00Z) | Current (2026-03-15T12:15:00Z) |
|--|--|--|
| Status | gaps_found | human_needed |
| Score | 14/15 | **15/15** |
| Gaps open | 1 | **0** |
| Commit | — | `faebd26` |

**Gap closed:** The root-onto-root RQ demote operation is now fully implemented. Commit `faebd26` adds:
- `lastPointerY` ref tracking pointer Y via `onDragMove`
- `handleDragMove` function wired to DndContext `onDragMove`
- `data-rq-id` attribute on `RQNode` outer div for bounding rect lookup
- Pointer-zone check at the top of Case 1 in `handleDragEnd` — middle 50% of target height = demote, top/bottom 25% = sibling reorder
- Dead `else if (draggedParentId === null && targetParentId === null)` branch removed from Case 2
- Visual blue ring highlight on nest target during hover (`dropTarget` state)

---

## Goal Achievement

### Observable Truths

#### Plan 01 — Backend API & Frontend Client

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | RQ CRUD endpoints respond correctly (create, list, update, delete) | ✓ VERIFIED | `routers/research_questions.py` has 8 routes: POST/GET project-scoped, PATCH/DELETE/POST-reorder/GET-papers/POST-papers/DELETE-papers rq-scoped. All call `rq_service.*`. |
| 2 | Project-paper link endpoints respond correctly (list, link, unlink) | ✓ VERIFIED | `routers/projects.py` extended with GET/POST/DELETE `/{project_id}/papers`, wired to `project_papers_service.*`. |
| 3 | RQ-paper link endpoints respond correctly (list, link, unlink) | ✓ VERIFIED | `routers/research_questions.py` has GET/POST/DELETE `/{rq_id}/papers`, wired to `rq_service.list_rq_papers`, `rq_service.link_paper_to_rq`, `rq_service.unlink_paper_from_rq`. |
| 4 | Cascade delete removes children when parent RQ is deleted | ✓ VERIFIED | `017_research_questions.sql` defines `parent_id TEXT REFERENCES research_questions(id) ON DELETE CASCADE`. Service `delete_rq` deletes by id and logs "DB cascade removes children". |
| 5 | Frontend API client has methods for all new endpoints | ✓ VERIFIED | `api.js` lines 327-344: `researchQuestionsApi` (8 methods) and `projectPapersApi` (3 methods) — all path patterns match router routes exactly. |

#### Plan 02 — RQ Tree UI

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 6 | User can create a primary research question via inline text input and Enter | ✓ VERIFIED | `AddRQInput` component renders inline input, calls `researchQuestionsApi.create(projectId, { question })` on Enter or commit-on-blur. Wired to `RQSection` at root level. |
| 7 | User can create sub-questions under any RQ via Add sub-question button | ✓ VERIFIED | `AddRQInput` rendered inside expanded `RQNode` with `parentId={rq.id}`. |
| 8 | User can expand/collapse RQs with chevron; collapsed shows sub-question count | ✓ VERIFIED | `expanded` state in `RQNode`. Chevron `expand_more`/`chevron_right` toggles it. `!expanded && hasChildren` renders sub-question count. |
| 9 | User can add/edit a hypothesis text field on any expanded RQ | ✓ VERIFIED | `saveHypothesis()` calls `researchQuestionsApi.update(rq.id, { hypothesis: newVal })`. Empty string converted to `null` to clear. |
| 10 | User can change RQ status via colored badge pill dropdown | ✓ VERIFIED | `RQStatusDropdown` with 4 statuses (open/investigating/answered/discarded). `onChange` calls `researchQuestionsApi.update(rq.id, { status: newStatus })`. |
| 11 | User can inline-edit RQ question text (click to edit, Enter to save, Escape to cancel) | ✓ VERIFIED | `saveQuestion` calls `researchQuestionsApi.update(rq.id, { question: trimmed })`. State managed via `editingQuestion` + `questionDraft`. |
| 12 | User can delete an RQ via three-dot context menu with cascade confirmation | ✓ VERIFIED | `more_vert` button shows dropdown with Delete option. `window.confirm(...)` if `rq.children.length > 0`. Calls `researchQuestionsApi.remove(rq.id)` then `onRefresh()`. |

#### Plan 03 — Literature Tab, Linking, Gap Indicators

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 13 | User can see a Literature tab in ProjectDetail left nav and switch to it | ✓ VERIFIED | navItems array includes `{ id: 'literature', icon: 'menu_book', label: 'Literature' }`. Tab renders `<LiteratureTab projectId={project.id} libraryId={project.libraryId} />`. |
| 14 | User can link papers/websites to a project via search picker on Literature tab | ✓ VERIFIED | `SearchPicker` component debounces search, calls `papersApi.list` and `websitesApi.list` in parallel with `library_id` filter, calls `projectPapersApi.link(projectId, data)` on select. |
| 15 | User can see linked papers and websites in a table on the Literature tab | ✓ VERIFIED | `LiteratureTab` fetches `projectPapersApi.list()`, builds lookup maps, renders table with Title, Type badge, Added, Unlink button. |
| 16 | User can unlink papers/websites from a project | ✓ VERIFIED | Unlink button calls `projectPapersApi.unlink(projectId, linkId)` then removes from local state. |
| 17 | User can link papers from the library to a specific RQ via a link button on each RQ | ✓ VERIFIED | `MiniSearchPicker` inline in `RQNode` when expanded. Calls `researchQuestionsApi.linkPaper(rq.id, data)` then refreshes `rqPapers` for that RQ. |
| 18 | User can see a gap indicator (warning icon) on any RQ that has no linked papers | ✓ VERIFIED | `{!hasLinkedPapers && <Icon name="warning_amber" ... />}`. `hasLinkedPapers = (rqPapersMap?.get(rq.id) || []).length > 0`. |
| 19 | User can link a paper/website to a project from the Paper or Website detail page | ✓ VERIFIED | `LinkToProjectButton` in both `Paper.jsx` and `Website.jsx`. Calls `projectPapersApi.link(project.id, { paperId })` or `{ websiteId }`. |

#### Plan 04 — Drag-and-Drop (all four operations)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 20 | User can drag a sub-question to root area to promote it to a primary RQ | ✓ VERIFIED | `handleDragEnd` Case 2: when `draggedParentId !== null && targetParentId === null`, sets `newParentId = null`. API called with `parent_id: null`. |
| 21 | User can drag a childless primary RQ onto another primary to make it a sub-question | ✓ **VERIFIED (was FAILED)** | `handleDragEnd` Case 1 now has pointer-zone check: if `draggedParentId === null && targetParentId === null`, calls `computeDropMode(over.id)`. When mode is `'nest'` (pointer in middle 50%), calls `researchQuestionsApi.update(draggedNode.id, { parent_id: targetNode.id, position: newPosition })`. Childless constraint also fires in this branch. Lines 818–843. Commit `faebd26`. |
| 22 | User can drag a sub-question to a different parent to move it | ✓ VERIFIED | `handleDragEnd` Case 2 last branch: `draggedParentId !== null && targetParentId !== null && draggedParentId !== targetParentId` → `newParentId = targetParentId`. |
| 23 | User can drag between siblings to reorder | ✓ VERIFIED | `handleDragEnd` Case 1: when pointer is in top/bottom 25% zone (or non-root same-parent), `arrayMove` reorders siblings, calls `researchQuestionsApi.reorder()`. Optimistic position update applied first. |
| 24 | Dragging an RQ with children onto another RQ is blocked | ✓ VERIFIED | Line 883: `if (draggedNode.children && draggedNode.children.length > 0) { console.warn(...); return }` in Case 2. Root-onto-root case also has its own inline check at line 822. |

**Score: 15/15 must-have truths verified**

---

### Required Artifacts

| Artifact | Lines | Status | Details |
|----------|-------|--------|---------|
| `backend/migrations/017_research_questions.sql` | 67 | ✓ VERIFIED | 3 CREATE TABLE statements: `research_questions`, `project_papers`, `rq_papers`. Correct FKs, CHECK constraints, partial unique indexes, RLS disabled. |
| `backend/models/research_question.py` | 30 | ✓ VERIFIED | `ResearchQuestion`, `ResearchQuestionCreate`, `ResearchQuestionUpdate` all present with correct fields. `status` uses `Literal`. |
| `backend/models/project_paper.py` | 34 | ✓ VERIFIED | `ProjectPaper`, `ProjectPaperCreate`, `RqPaper`, `RqPaperCreate` present. |
| `backend/services/rq_service.py` | 118 | ✓ VERIFIED | 9 functions: `list_rqs`, `get_rq`, `create_rq`, `update_rq`, `delete_rq`, `reorder_rqs`, `list_rq_papers`, `link_paper_to_rq`, `unlink_paper_from_rq`. |
| `backend/services/project_papers_service.py` | 44 | ✓ VERIFIED | 3 functions: `list_project_papers`, `link_paper_to_project`, `unlink_paper_from_project`. |
| `backend/routers/research_questions.py` | 102 | ✓ VERIFIED | 8 routes confirmed. Uses absolute paths to coexist project-scoped and rq-scoped routes in one router. |
| `frontend/src/services/api.js` | — | ✓ VERIFIED | `researchQuestionsApi` (8 methods), `projectPapersApi` (3 methods). URL patterns match backend routes exactly. |
| `frontend/src/pages/ProjectDetail.jsx` | 1497 | ✓ VERIFIED | Contains: `buildRqTree`, `rqStatusConfig`, `RQStatusDropdown`, `AddRQInput`, `RQNode` (recursive), `RQSection`, `MiniSearchPicker`, `SearchPicker`, `LiteratureTab`, `handleDragEnd` with pointer-zone heuristic, `handleDragMove`, `computeDropMode`, `lastPointerY` ref, `dropTarget` state — all wired. |
| `frontend/src/pages/Paper.jsx` | 554 | ✓ VERIFIED | `LinkToProjectButton` component, rendered in paper action area. Imports `projectPapersApi`. |
| `frontend/src/pages/Website.jsx` | 526 | ✓ VERIFIED | `LinkToProjectButton` component, rendered in website action area. Imports `projectPapersApi`. |
| `frontend/package.json` | — | ✓ VERIFIED | `@dnd-kit/core: ^6.3.1`, `@dnd-kit/sortable: ^10.0.0`, `@dnd-kit/utilities: ^3.2.2` present. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/routers/research_questions.py` | `backend/services/rq_service.py` | function calls | ✓ WIRED | All 8 routes call `rq_service.*`. |
| `backend/routers/projects.py` | `backend/services/project_papers_service.py` | function calls | ✓ WIRED | 3 paper-link routes call `project_papers_service.*`. |
| `backend/app.py` | `backend/routers/research_questions.py` | include_router | ✓ WIRED | Line 19 imports `research_questions`; line 52 `app.include_router(research_questions.router)`. |
| `frontend/src/pages/ProjectDetail.jsx` | `researchQuestionsApi` | import from api.js | ✓ WIRED | `researchQuestionsApi` used in `AddRQInput`, `RQNode`, `RQSection`. |
| `DndContext onDragEnd` | `researchQuestionsApi.update` with `parent_id = targetNode.id` | pointer-zone check in Case 1 | ✓ **NEWLY WIRED** | Lines 832–834: `await researchQuestionsApi.update(draggedNode.id, { parent_id: targetNode.id, position: newPosition })` inside the `mode === 'nest'` branch. |
| `DndContext onDragMove` | `lastPointerY.current` | `handleDragMove` at line 776 | ✓ WIRED | `handleDragMove` reads `activatorEvent.clientY + delta.y` into ref. Wired to `DndContext onDragMove={handleDragMove}` at line 955. |
| `computeDropMode` | `document.querySelector('[data-rq-id="..."]')` | `data-rq-id` attribute on RQNode line 485 | ✓ WIRED | `data-rq-id={rq.id}` on RQNode outer div (not on DragOverlay clone — correctly only on non-overlay renders). |
| `DndContext onDragEnd` | `researchQuestionsApi.update` | parent_id + position update (Case 2) | ✓ WIRED | Line 917: `await researchQuestionsApi.update(draggedNode.id, { parent_id: newParentId, position: newPosition })`. |
| `DndContext onDragEnd` | `researchQuestionsApi.reorder` | sibling reorder call (Case 1 fallthrough) | ✓ WIRED | Line 871: `await researchQuestionsApi.reorder(reordered[0].id, ids)`. |
| `LiteratureTab` | `projectPapersApi` | list/link/unlink calls | ✓ WIRED | `projectPapersApi.list`, `projectPapersApi.unlink`, `SearchPicker` calls `projectPapersApi.link`. |
| `RQNode gap indicator` | `rqPapersMap state` | derived hasLinkedPapers | ✓ WIRED | `rqPapersMap?.get(rq.id)` → `hasLinkedPapers` → renders `warning_amber` when false. |

---

### Requirements Coverage

| Requirement | Description | Source Plan | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| RQ-01 | User can create a primary research question for a project | 01, 02 | ✓ SATISFIED | `AddRQInput` at root level; `researchQuestionsApi.create(projectId, { question })` |
| RQ-02 | User can create sub-questions under a primary RQ | 01, 02 | ✓ SATISFIED | `AddRQInput` with `parentId={rq.id}` inside expanded `RQNode` |
| RQ-03 | User can add a hypothesis field to any RQ | 01, 02 | ✓ SATISFIED | `saveHypothesis()` inline editor in `RQNode`; clears when empty (sends null) |
| RQ-04 | User can set RQ status (open/investigating/answered/discarded) | 01, 02 | ✓ SATISFIED | `RQStatusDropdown` with 4 statuses; calls `update` on change |
| RQ-05 | User can link motivating papers from the library to a specific RQ | 03 | ✓ SATISFIED | `MiniSearchPicker` inline in `RQNode`; `researchQuestionsApi.linkPaper`; chips with unlink X |
| RQ-06 | User can edit and delete RQs AND drag-and-drop rearrange (all 4 ops) | 01, 02, 04, 05 | ✓ **FULLY SATISFIED** | Edit/delete: wired. All 4 DnD ops: sibling reorder (Case 1 edge zone), root demote (Case 1 center zone via `computeDropMode`), sub-to-root promote (Case 2), cross-parent reparent (Case 2). Childless constraint fires in both Case 1 nest branch and Case 2. |
| LIT-01 | User can link papers/websites from the library to a project | 01, 03 | ✓ SATISFIED | `LiteratureTab` with `SearchPicker`; `projectPapersApi.link`; bidirectional from `Paper.jsx`/`Website.jsx` |
| LIT-03 | User can see which RQs have no linked papers (gap indicator) | 03 | ✓ SATISFIED | `warning_amber` icon when `!hasLinkedPapers`; `rqPapersMap` populated via `researchQuestionsApi.listPapers` for every RQ |
| LIT-04 | User can remove paper/website links from projects and experiments | 01, 03 | ✓ SATISFIED | `projectPapersApi.unlink` in `LiteratureTab`; `researchQuestionsApi.unlinkPaper` via chip X button |

**All 9 requirements satisfied. Orphaned requirements check:** LIT-02 (link papers to experiments) is correctly marked Phase 3 in REQUIREMENTS.md — not claimed by any Phase 2 plan, not a gap.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `frontend/src/pages/ProjectDetail.jsx` | Phase 3 placeholder div for Experiments | ℹ️ Info | Intentional placeholder for next phase, no impact |
| `frontend/src/pages/ProjectDetail.jsx` | Phase 3 "Coming Soon" sidebar section | ℹ️ Info | Intentional placeholder for next phase, no impact |

No blockers. No stub implementations. No empty handlers. All API calls are wrapped in try/catch with `console.error` logging. No TODO/FIXME/PLACEHOLDER comments in the DnD implementation.

---

### Build Verification

`npx vite build` from `frontend/`: **`✓ built in 17.26s` — zero errors.** One size warning (chunk > 500 kB) is pre-existing and not a blocker.

---

### Human Verification Required

#### 1. Full RQ CRUD flow in browser

**Test:** Create primary RQ, add sub-question, click question text to edit, change status, add hypothesis, collapse/expand parent, delete with cascade confirm.
**Expected:** All interactions feel instant and persist on page refresh.
**Why human:** React state flows, click-to-edit debounce, and confirm dialogs cannot be verified statically.

#### 2. Literature tab search filtering by library

**Test:** With a project in Library A, search in the Literature tab SearchPicker. Verify only papers/websites from Library A appear.
**Expected:** `libraryId` filter is passed to search API (fix from commit `04512ee`).
**Why human:** Requires live Supabase data with multiple libraries.

#### 3. Gap indicator lifecycle

**Test:** Open a project with an RQ that has no linked papers — confirm warning_amber icon shows. Link a paper to that RQ — confirm icon disappears.
**Expected:** `rqPapersMap` updates via `onRqPapersChange` callback; icon renders reactively.
**Why human:** Requires live API and reactive state observation.

#### 4. Root-onto-root demote — center zone nests, edge zone reorders

**Test:** Create 3 root RQs (none with children). Drag the first RQ and hover its drag handle over the **center body** of the second — confirm: (a) blue ring appears on target while hovering, (b) on release, first RQ becomes a sub-question of second. Then drag the third RQ near the **top or bottom edge** of the second — confirm they reorder as siblings.
**Expected:** Center-zone drop calls `researchQuestionsApi.update` with `parent_id: targetNode.id`. Edge-zone drop calls `researchQuestionsApi.reorder`.
**Why human:** DnD pointer zone split (middle 50% / edges 25%) depends on live element bounding rects; requires browser to trigger.

#### 5. Childless constraint blocks demote

**Test:** Create a root RQ with one sub-question. Drag it and hover its center over another root RQ. Release.
**Expected:** No nesting occurs; only a `console.warn` is emitted; tree is unchanged.
**Why human:** Requires browser drag simulation to hit the constraint path.

---

### Gaps Summary

**No automated gaps.** All 15 must-have truths are verified in the codebase. The previous gap (root-onto-root demoting unreachable) is closed:

- `lastPointerY` ref exists at line 714, initialized to `null`
- `handleDragMove` exists at line 776, wired to `DndContext onDragMove` at line 955, writes `activatorEvent.clientY + delta.y` into ref
- `data-rq-id={rq.id}` attribute on RQNode outer div at line 485 (excluded from DragOverlay clone)
- `computeDropMode` function at line 766 uses `data-rq-id` to look up bounding rect and classify pointer as `'nest'` or `'reorder'`
- Pointer-zone check at the top of Case 1 (lines 818–843): `if (draggedParentId === null && targetParentId === null)` → `computeDropMode(over.id)` → when `'nest'`, calls `researchQuestionsApi.update(draggedNode.id, { parent_id: targetNode.id, ... })`
- Dead `else if (draggedParentId === null && targetParentId === null)` branch in Case 2 is removed — confirmed absent from file

Remaining items are human-verification only (visual behavior, interactive state flows, live API).

---

*Verified: 2026-03-15T12:15:00Z*
*Verifier: Claude (gsd-verifier)*
*Re-verification after gap closure: plans 02-05 (commit faebd26) and 02-06 (gap-closure confirmation)*
