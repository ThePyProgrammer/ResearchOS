---
phase: quick
plan: 4
subsystem: frontend/ProjectDetail
tags: [literature, table, ui, sorting, multi-select]
dependency_graph:
  requires: []
  provides: [LiteratureTab with Library.jsx UI patterns]
  affects: [frontend/src/pages/ProjectDetail.jsx]
tech_stack:
  added: []
  patterns: [statusConfig from PaperInfoPanel, useMemo flat items array, toggleSort/toggleCheck pattern from Library.jsx]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectDetail.jsx
decisions:
  - Local helper functions (litFormatAuthors, litItemYear, litItemVenue) prefixed with "lit" to avoid name collision with future imports of the same helpers from Library.jsx
  - LitDetailPanel kept as a simple lightweight preview (no tabs, no notes, no related papers) — full editing via "Open in Library" link
  - Unlink button on rows uses opacity-0 group-hover:opacity-100 to avoid cluttering the table
  - handleUnlink no longer references the items useMemo to avoid forward reference — just filters links state by linkId
metrics:
  duration: 8 min
  completed: 2026-03-17T17:45:33Z
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 4: Rebuild LiteratureTab to Match Library.jsx Summary

**One-liner:** Replaced simple 3-column literature table with full Library-style sortable table, checkbox multi-select, text search, bulk unlink, and a lightweight detail slide-over panel.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Rebuild LiteratureTab with Library.jsx table patterns and detail panel | d405176 | Done |

## What Was Built

The `LiteratureTab` component in `frontend/src/pages/ProjectDetail.jsx` was rebuilt from scratch to match the Library.jsx table UI:

**Table columns:** checkbox (select-all with indeterminate), Status, Title, Authors, Date, Venue, Unlink (hover-visible)

**Sorting:** `toggleSort` pattern from Library.jsx — click header to sort ascending, click again for descending, click a third time to clear. Sort indicators use arrow_upward / arrow_downward Material Symbols icons.

**Multi-select:** `toggleCheck` / `toggleSelectAll` pattern from Library.jsx. Header checkbox has proper indeterminate state via ref callback.

**Search filter:** Simple text input filtering items by title (case-insensitive).

**Bulk action bar:** Appears when items are selected. Shows count, "Unlink Selected" button, and clear (X) button.

**LitDetailPanel:** 320px fixed-width slide-over showing title, status badge, type badge (for websites/repos), authors, year, venue, abstract (6-line clamp), "Open in Library" button, and "Unlink" button.

**Data source unchanged:** Still fetches via `projectPapersApi.list` + paper/website/repo lookups. Links are transformed into a flat `items` array with `itemType` and `_linkId` fields.

**ProjectLiterature wrapper** updated from `overflow-auto` to `overflow-hidden` so the inner flex layout controls scrolling (table body gets `overflow-y-auto`).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `frontend/src/pages/ProjectDetail.jsx` modified
- [x] Commit d405176 exists
- [x] Build succeeded: `✓ built in 16.00s`

## Self-Check: PASSED
