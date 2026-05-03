---
phase: 02-research-questions-literature
plan: "03"
subsystem: frontend
tags: [literature, project-linking, research-questions, search-picker]
dependency_graph:
  requires: ["02-02"]
  provides: ["LiteratureTab", "SearchPicker", "RQ gap indicators", "per-RQ paper linking", "Link to project from Paper/Website"]
  affects: ["frontend/src/pages/ProjectDetail.jsx", "frontend/src/pages/Paper.jsx", "frontend/src/pages/Website.jsx"]
tech_stack:
  added: []
  patterns:
    - "Debounced search picker with outside-click close via ref + useEffect"
    - "rqPapersMap (Map<rqId, RqPaper[]>) passed down to RQNode for gap indicator"
    - "Lazy project fetch on dropdown open (fetch once, cache in component state)"
    - "409/duplicate error handling treated as already-linked state in LinkToProjectButton"
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx
    - frontend/src/pages/Paper.jsx
    - frontend/src/pages/Website.jsx
decisions:
  - "LinkToProjectButton duplicated in Paper.jsx and Website.jsx rather than extracted to shared component — both files are self-contained by convention; avoids adding a new shared component file for a small button"
  - "rqPapersMap fetched in parallel after loading flat RQs, stored as Map in RQSection state, passed to RQNode via props — avoids per-node fetching on render"
  - "LiteratureTab fetches full papers+websites lists and joins client-side — correct for small projects, simple to implement vs. pagination/ID-batched lookup"
metrics:
  duration: "6 min"
  completed: "2026-03-15"
  tasks_completed: 2
  files_modified: 3
---

# Phase 02 Plan 03: Literature Tab and Project Linking Summary

**One-liner:** Literature tab with debounced search picker, RQ gap indicators (warning_amber), per-RQ paper linking with chips, and bidirectional "Link to project" buttons on Paper/Website detail pages.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Literature tab, SearchPicker, RQ gap indicators, RQ paper linking | a8587af | ProjectDetail.jsx |
| 2 | Link to project button on Paper and Website detail pages | f4a427d | Paper.jsx, Website.jsx |

## What Was Built

### Task 1 — ProjectDetail.jsx

**LeftNav:** Added `literature` tab (menu_book icon) between Overview and Notes.

**LiteratureTab component:**
- On mount: fetches `projectPapersApi.list()`, `papersApi.list()`, `websitesApi.list()` in parallel
- Builds `paperLookup` and `websiteLookup` Maps for O(1) join
- Renders a table with Title, Type badge (blue=Paper, purple=Website), Added (relative date), and Unlink button (link_off icon)
- Empty state: dashed border box with menu_book icon
- Unlink button calls `projectPapersApi.unlink()` and removes from local state

**SearchPicker component:**
- Debounced 300ms search across `papersApi.list({ search })` and `websitesApi.list({ search })` in parallel
- Combined dropdown (max 8 of each) with type badge, title, authors
- Already-linked items shown with checkmark and reduced opacity (non-clickable)
- Outside-click closes dropdown via ref + mousedown listener
- On select: calls `projectPapersApi.link()` then triggers `onLinked()` callback to refresh

**RQNode changes:**
- Fetches `rqPapersMap` (Map<rqId, RqPaper[]>) via parallel `researchQuestionsApi.listPapers()` in RQSection after loading RQs
- `warning_amber` icon (text-amber-400, text-[14px]) shows on RQs with zero linked papers
- "Link paper" button opens inline `MiniSearchPicker` when expanded
- Linked papers render as chips (blue-50 bg, truncated title, close button to unlink)
- `onRqPapersChange(rqId, papers)` callback updates the Map immutably in RQSection

**MiniSearchPicker:** Same pattern as SearchPicker but smaller (text-xs, narrower), used inline within RQNode.

### Task 2 — Paper.jsx and Website.jsx

**LinkToProjectButton component** (identical logic in both files):
- `link` icon button in header action area
- On click: fetches projects lazily (once, cached), opens dropdown
- Each project row shows name, status badge, and checkmark if already linked
- On project click: calls `projectPapersApi.link(projectId, { paperId })` or `{ websiteId }`
- 409/duplicate errors treated as already-linked (sets linkedIds) rather than throwing
- Outside-click closes dropdown

Paper.jsx: hover color `hover:text-blue-600`, placed before BibTeX button
Website.jsx: hover color `hover:text-teal-600`, same placement

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- frontend/src/pages/ProjectDetail.jsx: FOUND
- frontend/src/pages/Paper.jsx: FOUND
- frontend/src/pages/Website.jsx: FOUND

Commits exist:
- a8587af: FOUND
- f4a427d: FOUND

Build: passes with zero errors (only pre-existing chunk size warning).
