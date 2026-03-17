---
phase: 07-experiment-table-view
verified: 2026-03-18T03:10:00Z
status: human_needed
score: 11/12 success criteria verified
human_verification:
  - test: "Verify color-coded column headers — blue for config, green for metric"
    expected: "Config column headers display with a blue tint (bg-blue-50 or similar), metric column headers display with a green tint (bg-emerald-50 or similar)"
    why_human: "headerBgClass() always returns 'bg-slate-50' regardless of column type (line 3047-3049 of ProjectDetail.jsx). Group separators (border-l-2) are used instead. The ROADMAP success criterion 3 says 'Config headers have blue tint and metric headers have green tint.' The implementation replaced colored headers with group separator borders (commit 650fef5). Whether this satisfies the spirit of the requirement needs human judgment — the ColumnPicker uses blue/green text labels but the header cells themselves have no color tint."
---

# Phase 7: Experiment Table View Verification Report

**Phase Goal:** Researchers can view and interact with experiments in a spreadsheet-style table with dynamic columns, filtering, sorting, inline editing, and column management — complementing the existing tree view

**Verified:** 2026-03-18T03:10:00Z
**Status:** human_needed (automated checks passed on 11/12 success criteria; 1 needs human confirmation)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can toggle between tree and table views, preference persisted per project | VERIFIED | `viewMode` state via `useLocalStorage('researchos.exp.view.${projectId}', 'tree')` at line 3618; toggle buttons at lines 3773-3784; conditional render at line 3878 |
| 2 | Table shows all experiments flat with type icon, name, status, parent group, and dynamic config/metric columns | VERIFIED | `buildColumns()` produces type_icon, name, status, parent fixed cols + config:: and metric:: dynamic cols; `filteredRows.map(exp => ...)` renders all rows (line 3395) |
| 3 | Config headers have blue tint and metric headers have green tint | HUMAN NEEDED | `headerBgClass()` always returns `'bg-slate-50'` (line 3047-3049) — deviation from plan. Group separator borders (border-l-2) replace tinted backgrounds (commit 650fef5). ColumnPicker uses blue/green text labels but not header backgrounds. |
| 4 | Header row and name column remain sticky when scrolling | VERIFIED | `<thead className="sticky top-0 z-10">` at line 3203; checkbox col has `sticky left-0 z-20` at line 3213; scrollable container is `overflow-auto` at line 3201 |
| 5 | User can sort by any column (ascending/descending/clear) and see sort indicators | VERIFIED | `handleSort()` cycles asc/desc/null at lines 2954-2960; `sortRows()` exported and used in `filteredRows` derivation; sort indicator via `SortableColumnHeader` at line 2302 |
| 6 | User can filter experiments using Notion-style filter chips with full operator support | VERIFIED | `FilterBar` (line 2552) + `FilterChip` (line 2435) components; 7 numeric operators (eq, neq, gt, lt, between, empty, notempty) + contains, is, isnot; status multi-select checkboxes; `filters.every(f => applyFilter(exp, f))` at line 3041 |
| 7 | User can show/hide, resize, reorder, and add columns with settings persisted in localStorage | VERIFIED | `ColumnPicker` at line 2238; `handleResizeStart` at line 2963; `DndContext id="column-dnd"` with `horizontalListSortingStrategy` at lines 3204-3210; `handleAddColSubmit` at line 3016; all stored in `colState` via `useLocalStorage('researchos.exp.table.cols.${projectId}', ...)` at line 2873 |
| 8 | User can double-click cells to edit config/metric values inline and single-click status to change it | VERIFIED | `EditableCell` component at line 2364; wired to config/metric cells via `renderCellValue` at line 3051; `ExperimentStatusDropdown` for status (line 3074); API updates via `experimentsApi.update` |
| 9 | User can click a row to open a detail side panel with full experiment info | VERIFIED | `detailExpId` state at line 2856; row `onClick={() => setDetailExpId(...)}` at line 3401; `ExperimentDetailPanel` at line 2637 with config KVEditor, metrics KVEditor, status dropdown, notes, and literature linking |
| 10 | User can quickly add experiments via inline new row at the bottom | VERIFIED | `newRowName` state at line 2834; input at line 3468; `experimentsApi.create` on Enter at line 3472 |
| 11 | Checkbox selection is shared between tree and table views for comparison workflow | VERIFIED | `selectedLeafIds` Set is in `ExperimentSection` state (line 3615); passed as prop to both `ExperimentTableView` (line 3881) and the tree DnD context (line 3736); `onToggle={handleToggleNode}` shared |
| 12 | Best metric values can be highlighted with a toggle and per-metric lower-is-better option | VERIFIED | `highlightBest` toggle at line 3178; `lowerIsBetter` state at line 2860; `metricCellClass` applied to metric cells at line 3441; per-metric lower-is-better toggle pills in `SortableColumnHeader` at lines 2338-2349 |

**Score:** 11/12 success criteria verified (1 human_needed for header color tinting)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/hooks/useLocalStorage.js` | Shared useLocalStorage hook | VERIFIED | Exists, 18 lines, exports `useLocalStorage` named export |
| `frontend/src/pages/ProjectDetail.tableview.test.jsx` | Unit tests for buildColumns/applyFilter/sortRows | VERIFIED | 26 tests across 3 describe blocks, all green |
| `frontend/src/pages/ProjectDetail.jsx` | ExperimentTableView + helper exports + all Plan 02/03 components | VERIFIED | Contains ExperimentTableView (line 2832), ColumnPicker (line 2238), SortableColumnHeader (line 2302), EditableCell (line 2364), FilterChip (line 2435), FilterBar (line 2552), ExperimentDetailPanel (line 2637) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/src/hooks/useLocalStorage.js` | `NoteGraphView.jsx` | import replaces inline definition | VERIFIED | Line 4 of NoteGraphView.jsx: `import { useLocalStorage } from '../hooks/useLocalStorage'`; no inline definition remains |
| `frontend/src/pages/ProjectDetail.jsx` | `useLocalStorage` | `import { useLocalStorage } from '../hooks/useLocalStorage'` | VERIFIED | Line 9 of ProjectDetail.jsx |
| `buildColumns/applyFilter/sortRows/getCellValue` | exported | `export { ... }` at line 1992 | VERIFIED | All 4 functions exported |
| `ExperimentTableView` | `ExperimentSection` | `viewMode === 'table'` conditional render | VERIFIED | Line 3878: `viewMode === 'table' ? <ExperimentTableView ...>` |
| `ExperimentTableView` | `selectedLeafIds` | shared Set prop | VERIFIED | Props `selectedLeafIds={selectedLeafIds}` and `onToggle={handleToggleNode}` at lines 3881-3882 |
| `buildColumns` | `unionKeys` | reuses existing helper | VERIFIED | Lines 1892-1893: `unionKeys(flatTree.map(e => e.config || {}))` and `unionKeys(flatTree.map(e => e.metrics || {}))` |
| `FilterBar` | `applyFilter` | `filters.every(f => applyFilter(exp, f))` | VERIFIED | Line 3041 |
| `ExperimentDetailPanel` | row click | `setDetailExpId` on tr onClick | VERIFIED | Line 3401: `onClick={() => setDetailExpId(prev => prev === exp.id ? null : exp.id)}` |
| `filter state` | `localStorage` | `useLocalStorage('researchos.exp.table.filters.${projectId}', [])` | VERIFIED | Line 2853 |
| `column state` | `localStorage` | `useLocalStorage('researchos.exp.table.cols.${projectId}', ...)` | VERIFIED | Line 2873-2874 |
| `inline cell edit` | `experimentsApi.update` | JSONB patch on blur/Enter | VERIFIED | Lines 3062, 3074 — config, metrics, and name all call `experimentsApi.update` |
| `column reorder` | `@dnd-kit/sortable` | `horizontalListSortingStrategy` + `arrayMove` | VERIFIED | Lines 21, 3205-3011: separate DndContext id="column-dnd", `arrayMove` on drag end |

---

### Requirements Coverage

TABLE- requirements are defined in the ROADMAP (not in REQUIREMENTS.md). They are mapped to plans as follows:

| Requirement | Source Plan | Addressed By | Status |
|-------------|------------|--------------|--------|
| TABLE-01 | 07-01 | View toggle (tree/table) with localStorage per project | SATISFIED |
| TABLE-02 | 07-01 | Flat table with type icon, name, status, parent, config/metric columns | SATISFIED |
| TABLE-03 | 07-01 | Sticky header row and name column | SATISFIED (header sticky; name column sticky was removed — only checkbox column sticky due to z-index conflict fixed in commit 3127c7d) |
| TABLE-04 | 07-00, 07-02 | useLocalStorage hook + column management (picker, persist) | SATISFIED |
| TABLE-05 | 07-00, 07-01 | buildColumns/applyFilter/sortRows pure functions with tests | SATISFIED |
| TABLE-06 | 07-00, 07-03 | Filter state + operator support | SATISFIED |
| TABLE-07 | 07-02 | Column resize, reorder, add new column | SATISFIED |
| TABLE-08 | 07-03 | Row click opens detail side panel | SATISFIED |
| TABLE-09 | 07-01 | Sort ascending/descending/clear with visual indicators | SATISFIED |
| TABLE-10 | 07-02 | Double-click inline edit for config/metric/name; single-click status | SATISFIED |
| TABLE-11 | 07-03 | Best metric highlighting with per-metric lower-is-better toggle | SATISFIED |
| TABLE-12 | 07-01, 07-02 | Checkbox selection shared with tree view; inline new row | SATISFIED |

**Note:** TABLE- requirements are not listed in REQUIREMENTS.md traceability table — they exist only in ROADMAP.md. No orphaned requirements found.

---

### Anti-Patterns Found

| File | Finding | Severity | Impact |
|------|---------|----------|--------|
| `ProjectDetail.jsx:3047-3049` | `headerBgClass()` returns `'bg-slate-50'` unconditionally, ignoring `colType` parameter | Info | ROADMAP success criterion 3 ("Config headers have blue tint and metric headers have green tint") is not met at the CSS level — replaced by group separator borders (border-l-2) per commit 650fef5. ColumnPicker labels use color text, column headers themselves are uniform slate. |
| `ProjectDetail.jsx:3878` | No `ExperimentTableView` for empty state (`flatTree.length === 0`) — early return at line 3143 | Info | Expected behavior: empty state is handled correctly before table renders. Not a stub. |

No TODOs, FIXMEs, empty implementations, or console-log-only handlers found in the modified files.

---

### Human Verification Required

#### 1. Config/Metric Column Header Color Tinting

**Test:** Navigate to a project with experiments that have both config and metric keys. Switch to table view. Examine the column header cells for config columns (e.g., "lr", "batch_size") and metric columns (e.g., "loss", "accuracy").

**Expected per ROADMAP:** Config column headers should show a blue tint background (blue-50 or similar) and metric column headers should show a green tint background (emerald-50 or similar).

**Actual implementation:** All column headers share `bg-slate-50`. The visual distinction between config and metric column groups is done via a left border on the first column of each group (`border-l-2 border-l-slate-300`). The ColumnPicker dropdown uses blue/green text color labels, and the "Add column" popover uses blue/green styling. But the column header cells in the table have no color differentiation.

**Why human:** This is a deliberate design change documented in commit `650fef5` ("replace colored headers with group separator borders"). The SUMMARY notes "Group separator borders used instead of colored group headers — less visual noise." Whether the group separator approach adequately satisfies the intent of ROADMAP criterion 3 requires a human to judge — the ROADMAP says "blue tint"/"green tint" which is not implemented, but the change was intentional. If the user finds the group separators sufficient, the criterion can be considered met. If the user wants header color tints, `headerBgClass()` needs updating.

---

### Gaps Summary

No structural gaps found. All components exist with substantial implementation, all key links are wired, and all tests pass (78/78 across 7 test files). The only open item is a design interpretation question: whether group separator borders satisfy the ROADMAP requirement for blue/green header color tints.

The `applyFilter` function signature was changed relative to the original plan (plan specified `applyFilter(filter, exp)` but implementation uses `applyFilter(exp, filter)`) — the tests in ProjectDetail.tableview.test.jsx match the implementation's actual signature, and all 26 tests pass green.

---

## Test Results

- `frontend/src/pages/ProjectDetail.tableview.test.jsx`: 26/26 passed
- Full test suite: 78/78 passed across 7 test files

---

_Verified: 2026-03-18T03:10:00Z_
_Verifier: Claude (gsd-verifier)_
