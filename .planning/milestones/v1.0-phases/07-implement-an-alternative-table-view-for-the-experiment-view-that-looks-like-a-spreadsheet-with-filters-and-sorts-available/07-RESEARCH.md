# Phase 7: Experiment Table View - Research

**Researched:** 2026-03-16
**Domain:** React spreadsheet-style data table with dynamic columns, filtering, sorting, inline editing, column drag-reorder, and localStorage persistence
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Table Layout**
- All experiments shown flat (both parents and leaves), not just leaves
- Type icon column distinguishes parents (folder icon) from leaves (science icon)
- Fixed columns: Name, Type icon, Status, Parent group name, Created date
- Dynamic columns: union of all config keys + union of all metric keys auto-detected
- Config column headers have a subtle blue tint, metric headers have a green tint
- Sticky header row + sticky name column when scrolling
- Columns are resizable AND reorderable by dragging (full spreadsheet feel)
- Best metric values highlighted with toggle (same as CompareModal: "Highlight best" + per-metric lower-is-better toggle)

**Column Management**
- Column picker: toolbar "Columns" button opens a dropdown checklist to show/hide columns
- "Reset columns" button in the picker to restore defaults
- '+' icon at the end of column headers to add a new config or metric key column
- When adding via '+', dropdown lets user choose "Config" or "Metric"
- Column visibility, order, and widths persisted in localStorage per project

**Row Interaction**
- Clicking a row opens a side panel (slides in from right, like Library's PaperDetail)
- Checkbox multi-select on rows — reuses same selectedIds Set and floating action bar + CompareModal as tree view

**Filtering**
- Filter bar above the table with dropdown chips (like Notion's filter bar)
- Status filter: multi-select from 4 statuses (planned/running/completed/failed)
- "Add filter" for any config/metric column
- Full operator set for numeric values: equals, not equals, greater than, less than, between, is empty, is not empty
- Filter state persisted in localStorage per project

**Sorting**
- Click column header to sort: first click ascending, second descending, third clears
- Sort indicator arrow in the column header
- Single column sort at a time

**View Switching**
- Icon toggle (tree/table) in the Experiments section header
- View preference persisted in localStorage per project
- Selection state (checkboxes) carries over between tree and table views — shared selectedIds Set

**Adding Experiments**
- Existing "Add Experiment" header button reused (opens ExperimentCreateModal)
- Inline "new row" at the bottom with '+' icon for spreadsheet-style quick add

**Inline Editing**
- Double-click a cell to enter edit mode (input field, Enter to save, Escape to cancel)
- Status column: single click opens ExperimentStatusDropdown inline
- Config/metric values editable in cells — saves to the experiment's JSONB field via API

### Claude's Discretion
- Exact column drag handle implementation (library choice or custom)
- Filter bar chip design details
- Empty table state messaging
- Detail panel layout within the side panel
- How the inline "new row" creates the experiment (minimal fields vs full form)
- Performance approach for tables with many experiments (virtualization if needed)
- Exact sticky column/header CSS approach

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase adds an alternative spreadsheet-style table view for the experiment section in `ProjectDetail.jsx`. The primary challenge is building a feature-complete custom data table in vanilla React + Tailwind without adding a heavyweight table library — the existing codebase has `@dnd-kit` already installed (v10 sortable, v6 core) which covers column drag-reorder, and all cell editing, filtering, sorting, and persistence patterns are established in the codebase.

The work is purely frontend. No backend changes are needed — `experimentsApi.list()` already returns all experiments flat with full config/metrics JSONB, and `experimentsApi.update()` handles JSONB patch. The critical implementation decisions are: (1) sticky columns via CSS `position: sticky` on `<th>`/`<td>`, (2) column resizing via mouse drag on a resize handle div, (3) column reordering via `@dnd-kit/sortable` with `horizontalListSortingStrategy`, and (4) a custom localStorage hook (`useLocalStorage`) that already exists in `NoteGraphView.jsx` and needs to be extracted to a shared location.

**Primary recommendation:** Build `ExperimentTableView` as a self-contained component in `ProjectDetail.jsx`, following the same inlining pattern used for `CompareModal` and `ExperimentNode`. No external table library is needed; the feature set can be achieved with native HTML `<table>`, Tailwind, and `@dnd-kit`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.3.1 | Component state, memoization | Already in project |
| Tailwind CSS | 3.4.16 | Styling, color-coded headers, sticky | Already in project |
| @dnd-kit/sortable | 10.0.0 | Column reorder via `horizontalListSortingStrategy` | Already installed, already used for rows in tree view |
| @dnd-kit/core | 6.3.1 | DnD context, sensors | Already installed |
| @dnd-kit/utilities | 3.2.2 | CSS transform utilities | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| experimentsApi (existing) | - | CRUD for experiment data | All data fetching and PATCH |
| useLocalStorage (inline hook) | - | Persist column state, filter state, view mode | Extract from `NoteGraphView.jsx` to shared location or re-inline |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom table | TanStack Table v8 | TanStack Table provides virtualization and complex column APIs but adds ~50KB and a learning curve; overkill given the scale |
| @dnd-kit column DnD | HTML5 drag API | HTML5 drag lacks the smooth animation; @dnd-kit is already a dependency |
| CSS sticky | JS scroll listener | CSS `position: sticky` is simpler and better-performing |

**Installation:** No new packages needed. All dependencies are present.

---

## Architecture Patterns

### Recommended Project Structure

All new code lives in `frontend/src/pages/ProjectDetail.jsx` (the established pattern for this project — one large file per page). New test file:

```
frontend/src/pages/
├── ProjectDetail.jsx             # Add ExperimentTableView + helper functions
└── ProjectDetail.tableview.test.jsx   # Unit tests for pure helper functions
```

If the `useLocalStorage` hook is extracted:
```
frontend/src/hooks/
└── useLocalStorage.js            # Extract from NoteGraphView.jsx
```

### Pattern 1: Column State Shape

All column state lives in a single `columnState` object persisted to localStorage under key `researchos.exp.table.${projectId}`.

```js
// Column state persisted per project
const DEFAULT_COLUMN_STATE = {
  order: [],          // array of column IDs in display order
  hidden: [],         // array of hidden column IDs
  widths: {},         // { [colId]: number (px) }
}

// Column descriptor (not persisted — derived from flatTree)
// { id, label, type: 'fixed'|'config'|'metric', field }
```

Fixed column IDs: `'type_icon'`, `'name'`, `'status'`, `'parent'`, `'created_at'`

Dynamic column IDs: `'config::{key}'`, `'metric::{key}'` — namespaced to avoid collision.

### Pattern 2: Data Flow

```
ExperimentSection (existing)
  ├── flatTree (from flattenExperimentTree)    ← shared data source
  ├── selectedLeafIds Set                      ← shared checkbox state
  ├── viewMode: 'tree' | 'table'              ← new state, persisted
  ├── ExperimentTreeView (existing DnD tree)  ← rendered when viewMode='tree'
  └── ExperimentTableView (new)               ← rendered when viewMode='table'
        ├── derives columns from flatTree (unionKeys)
        ├── manages own filter/sort/column UI state
        └── shares selectedLeafIds + onToggle with tree view
```

### Pattern 3: Sticky Table CSS

The standard approach for sticky header + sticky first column in a scrollable container:

```jsx
// Source: established CSS pattern
<div className="overflow-auto max-h-[calc(100vh-300px)]">
  <table className="border-collapse text-sm w-max min-w-full">
    <thead>
      <tr>
        {/* Sticky header + sticky first column intersection */}
        <th className="sticky top-0 left-0 z-30 bg-white border-b border-slate-200 ...">
          Name
        </th>
        {/* Other sticky header cells */}
        <th className="sticky top-0 z-20 bg-white border-b border-slate-200 ...">
          Status
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        {/* Sticky name column body cells */}
        <td className="sticky left-0 z-10 bg-white border-r border-slate-100 ...">
          {name}
        </td>
        <td>...</td>
      </tr>
    </tbody>
  </table>
</div>
```

Key: `z-index` layering is critical — header+first-col intersection must be `z-30`, other headers `z-20`, sticky body cells `z-10`.

### Pattern 4: Column Resize Handle

Column resizing via a right-edge drag handle on each `<th>`. No library needed — standard mouse event pattern:

```jsx
// Source: established pattern for resizable columns
function useColumnResize(colId, initialWidth, onWidthChange) {
  const startX = useRef(null)
  const startW = useRef(null)

  function onMouseDown(e) {
    e.preventDefault()
    startX.current = e.clientX
    startW.current = initialWidth

    function onMouseMove(ev) {
      const delta = ev.clientX - startX.current
      const newWidth = Math.max(60, startW.current + delta)
      onWidthChange(colId, newWidth)
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return { onMouseDown }
}
```

Render a `<div>` at the right edge of each `<th>` with `cursor-col-resize` and attach `onMouseDown`.

### Pattern 5: Column Drag-Reorder with @dnd-kit

`horizontalListSortingStrategy` is confirmed available in the installed version. The column headers form a horizontal sortable list:

```jsx
import { horizontalListSortingStrategy, SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable'

// In the <thead> row:
<SortableContext items={visibleColumnIds} strategy={horizontalListSortingStrategy}>
  {visibleColumns.map(col => (
    <SortableColumnHeader key={col.id} col={col} ... />
  ))}
</SortableContext>

function SortableColumnHeader({ col, ... }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: col.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <th ref={setNodeRef} style={style}>
      {/* Drag handle - small grip icon */}
      <span {...attributes} {...listeners} className="cursor-grab ...">
        <Icon name="drag_indicator" />
      </span>
      {col.label}
      {/* Sort indicator + resize handle */}
    </th>
  )
}
```

Note: The `DndContext` wrapping column headers must be SEPARATE from the `DndContext` wrapping rows (or use nested contexts with `id`-qualified sensors). The existing tree view DnD is only active when `viewMode='tree'`, so there is no nesting conflict — the table view is rendered instead of the tree, not alongside it.

### Pattern 6: Inline Cell Editing

Follows the `KVEditor` pattern already in the codebase — double-click activates an input, Enter saves, Escape cancels:

```jsx
function EditableCell({ value, onSave, type = 'text' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function activate() { setEditing(true); setDraft(String(value ?? '')) }
  async function commit() {
    setEditing(false)
    const parsed = detectType(draft)  // reuse existing detectType()
    if (parsed !== value) await onSave(parsed)
  }

  if (editing) return (
    <input autoFocus value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 text-xs focus:outline-none" />
  )
  return <span onDoubleClick={activate}>{value ?? <span className="text-slate-300 italic">—</span>}</span>
}
```

For config/metric JSONB patch, save is:
```js
async function saveCellValue(expId, field, key, newValue) {
  const exp = flatTree.find(e => e.id === expId)
  const updated = { ...exp[field], [key]: newValue }
  await experimentsApi.update(expId, { [field]: updated })
  await fetchExperiments()  // re-fetch to sync
}
```

### Pattern 7: Filter State Shape

```js
// Filter chip data structure
// { id, column: colId, operator, value }
// operators for numeric: 'eq'|'neq'|'gt'|'lt'|'between'|'empty'|'notempty'
// operators for string/status: 'is'|'isnot'|'contains'|'empty'|'notempty'
// For 'between': value is [low, high]
// For status: value is array of selected statuses

const DEFAULT_FILTERS = []  // persisted in localStorage
```

Filtering is client-side — `flatTree` is already loaded. Apply filters as a `useMemo` derived array:

```js
const filteredRows = useMemo(() => {
  return flatTree.filter(exp => filters.every(f => applyFilter(f, exp)))
}, [flatTree, filters])
```

### Pattern 8: localStorage Key Convention

Follow established project conventions:

```js
// View mode (tree vs table)
`researchos.exp.view.${projectId}`  // 'tree' | 'table'

// Table column state (order, hidden, widths)
`researchos.exp.table.cols.${projectId}`  // JSON: { order, hidden, widths }

// Active filters
`researchos.exp.table.filters.${projectId}`  // JSON: array of filter objects
```

### Pattern 9: useLocalStorage Hook

Extract the `useLocalStorage` function already present in `NoteGraphView.jsx` to `frontend/src/hooks/useLocalStorage.js` so it can be reused across the new table components:

```js
// Currently in NoteGraphView.jsx lines 11-23 — extract to hooks/useLocalStorage.js
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch { return defaultValue }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  }, [key, value])
  return [value, setValue]
}
```

### Pattern 10: Side Panel for Row Detail

Follow `PaperInfoPanel` / `PaperDetail` pattern from `Library.jsx`: a fixed-width panel that renders to the right of the table when a row is selected. The table container shrinks using flex layout:

```jsx
<div className="flex gap-0">
  <div className={`flex-1 overflow-auto ${detailExp ? 'max-w-[calc(100%-360px)]' : 'w-full'}`}>
    {/* table */}
  </div>
  {detailExp && (
    <div className="w-90 border-l border-slate-200 flex-shrink-0 overflow-y-auto">
      <ExperimentDetailPanel experiment={detailExp} ... />
    </div>
  )}
</div>
```

### Anti-Patterns to Avoid

- **Nested DnD contexts for column + row reorder simultaneously:** The table view replaces the tree view (not coexists), so only one DnD context is active at a time. Do not wrap both in the same `DndContext`.
- **Mutating JSONB fields directly:** Always spread: `{ ...exp.config, [key]: newValue }` not `exp.config[key] = newValue`.
- **Deriving columns inside render:** Wrap `unionKeys()` calls in `useMemo` — they iterate all experiments and are expensive to recompute every render.
- **Saving column widths on every mousemove:** Debounce or save only on mouseup to avoid excessive localStorage writes.
- **Using `position: sticky` without explicit `background-color`:** Sticky cells are transparent by default and will show content scrolling underneath — always set `bg-white` or appropriate background.
- **Forgetting z-index on sticky cells:** The top-left intersection cell needs `z-30`; header row `z-20`; sticky name column `z-10`. Without this, sticky cells overlap incorrectly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column drag-reorder | Custom HTML5 drag API | `@dnd-kit/sortable` `horizontalListSortingStrategy` | Already installed; handles accessibility, pointer/touch, animations |
| Dynamic column union | Custom set logic | `unionKeys()` already in codebase | Handles edge cases, sorted output |
| Config inheritance | Custom tree walk | `getEffectiveConfig()` already in codebase | Handles multi-level ancestry |
| Best metric detection | Custom min/max | `getBestValue()` already in codebase | Handles lower-is-better toggle |
| localStorage persistence | Raw localStorage calls | `useLocalStorage` hook (extract from NoteGraphView) | JSON parse/serialize with error handling |
| Status badge rendering | Custom color map | `experimentStatusConfig` already in codebase | 4 statuses, color classes defined |

**Key insight:** ~80% of the data logic already exists in `CompareModal` and `ExperimentNode`. The table view is primarily a new rendering layer over the same data structures.

---

## Common Pitfalls

### Pitfall 1: Column Width Applied to `<col>` vs `<th>`

**What goes wrong:** Setting `width` or `style.width` on `<th>` does not reliably constrain column widths in all browsers when `table-layout: auto` is used.

**Why it happens:** HTML table layout algorithm ignores `width` on cells when it can recalculate to fill available space.

**How to avoid:** Use `table-layout: fixed` on the `<table>` element AND set widths on `<colgroup><col>` elements, OR set `minWidth` and `maxWidth` on `<th>` in combination with `overflow: hidden`. Given we want a scrollable wide table, use `w-max min-w-full` on `<table>` and rely on `style={{ width: colWidth }}` on each `<th>` with `table-layout: fixed`.

**Warning signs:** Columns snap to different sizes than configured; column widths don't match cell widths.

### Pitfall 2: Sticky Header Disappears Under Other Sticky Elements

**What goes wrong:** If the `ExperimentSection` is inside a scrolling parent that has its own sticky elements (e.g., page header), the sticky table header may stop sticking at the wrong scroll position.

**Why it happens:** `position: sticky` only works relative to the nearest scrollable ancestor. The table must be inside its own dedicated `overflow: auto` container, not relying on the page scroll.

**How to avoid:** Wrap the table in a `<div className="overflow-auto">` with a constrained `max-height`. Do not use the page body scroll for the table.

### Pitfall 3: Filter State Includes Column Keys That No Longer Exist

**What goes wrong:** If a user filters by `config::learning_rate` then removes that column, the filter references a non-existent key. On restore from localStorage, the filter chip renders but no rows match (silently wrong).

**Why it happens:** Filter state is persisted independently from the experiment data.

**How to avoid:** On load, validate filter column IDs against current `allColumnIds`. Drop any filters whose column no longer exists. Show a warning or silently drop.

### Pitfall 4: `experimentStatusDropdown` Single-Click Conflict with Row Selection

**What goes wrong:** Single-clicking a row opens the side detail panel. Single-clicking a status badge opens the status dropdown. These conflict — row click fires, then status dropdown click fires, reopening the panel when the user just wanted to change status.

**Why it happens:** Event bubbling — status cell click propagates to the row click handler.

**How to avoid:** Call `e.stopPropagation()` on the status cell click. Existing `ExperimentStatusDropdown` should be wrapped in a `<td onClick={e => e.stopPropagation()}>`.

### Pitfall 5: Column Reorder + Sticky Name Column Conflict

**What goes wrong:** If the user drags the "Name" column out of its sticky-first position, the sticky CSS no longer applies to the correct column.

**Why it happens:** The sticky `left-0` class is applied to the first column by DOM position, but after reorder it may no longer be "Name".

**How to avoid:** The "Name" column is a FIXED column — mark it as non-draggable and always render it first (outside of the `SortableContext`). Only dynamic and non-sticky fixed columns (Status, Parent, Created) are reorderable.

### Pitfall 6: Inline New Row at Table Bottom

**What goes wrong:** Creating an experiment via the inline new row requires at minimum a `name` and `projectId`. If the user presses Enter without a name, the API returns a validation error.

**Why it happens:** No form validation before API call.

**How to avoid:** Require a non-empty trimmed name before calling `experimentsApi.create()`. Show an inline error style (red border) on the name cell rather than a toast. After creation, call `fetchExperiments()` and scroll the new row into view.

---

## Code Examples

### Column Definition Array (Derived from flatTree)

```js
// Source: adapts unionKeys() from ProjectDetail.jsx line 1863
function buildColumns(flatTree) {
  const configKeys = unionKeys(flatTree.map(e => e.config || {}))
  const metricKeys = unionKeys(flatTree.map(e => e.metrics || {}))

  const fixed = [
    { id: 'type_icon', label: '',          type: 'fixed', width: 40,  sortable: false },
    { id: 'name',      label: 'Name',      type: 'fixed', width: 220, sortable: true },
    { id: 'status',    label: 'Status',    type: 'fixed', width: 110, sortable: true },
    { id: 'parent',    label: 'Group',     type: 'fixed', width: 140, sortable: true },
    { id: 'created_at',label: 'Created',   type: 'fixed', width: 100, sortable: true },
  ]
  const configCols = configKeys.map(k => ({
    id: `config::${k}`, label: k, type: 'config', width: 120, sortable: true, field: 'config', key: k,
  }))
  const metricCols = metricKeys.map(k => ({
    id: `metric::${k}`, label: k, type: 'metric', width: 120, sortable: true, field: 'metrics', key: k,
  }))

  return [...fixed, ...configCols, ...metricCols]
}
```

### Apply Filter Function

```js
// Source: custom, based on CONTEXT.md filter spec
function applyFilter(filter, exp) {
  const { column, operator, value } = filter

  // Resolve cell value
  let cellVal
  if (column === 'status') cellVal = exp.status
  else if (column === 'parent') cellVal = exp._parentId
  else if (column.startsWith('config::')) {
    const key = column.slice('config::'.length)
    cellVal = exp.config?.[key]
  } else if (column.startsWith('metric::')) {
    const key = column.slice('metric::'.length)
    cellVal = exp.metrics?.[key]
  }

  // Apply operator
  if (operator === 'empty') return cellVal === undefined || cellVal === null || cellVal === ''
  if (operator === 'notempty') return cellVal !== undefined && cellVal !== null && cellVal !== ''
  if (operator === 'is') return Array.isArray(value) ? value.includes(cellVal) : cellVal === value
  if (operator === 'isnot') return Array.isArray(value) ? !value.includes(cellVal) : cellVal !== value
  if (operator === 'gt') return typeof cellVal === 'number' && cellVal > value
  if (operator === 'lt') return typeof cellVal === 'number' && cellVal < value
  if (operator === 'eq') return String(cellVal) === String(value)
  if (operator === 'neq') return String(cellVal) !== String(value)
  if (operator === 'between') return typeof cellVal === 'number' && cellVal >= value[0] && cellVal <= value[1]
  return true
}
```

### Sort Function

```js
// Source: custom
function sortRows(rows, sort, parentMap) {
  if (!sort) return rows
  const { column, direction } = sort

  return [...rows].sort((a, b) => {
    const va = getCellValue(column, a, parentMap)
    const vb = getCellValue(column, b, parentMap)

    let cmp = 0
    if (va === null || va === undefined) cmp = 1
    else if (vb === null || vb === undefined) cmp = -1
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
    else cmp = String(va).localeCompare(String(vb))

    return direction === 'asc' ? cmp : -cmp
  })
}
```

### View Mode Toggle (in ExperimentSection header)

```jsx
// Source: UI pattern from Library.jsx view toggle
<div className="flex items-center gap-1 border border-slate-200 rounded-lg overflow-hidden">
  <button
    onClick={() => setViewMode('tree')}
    className={`px-2 py-1.5 ${viewMode === 'tree' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
    title="Tree view"
  >
    <Icon name="account_tree" className="text-[16px]" />
  </button>
  <button
    onClick={() => setViewMode('table')}
    className={`px-2 py-1.5 ${viewMode === 'table' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
    title="Table view"
  >
    <Icon name="table" className="text-[16px]" />
  </button>
</div>
```

### Config/Metric Column Header Tint Classes

```js
// Source: CONTEXT.md spec
function headerBgClass(colType) {
  if (colType === 'config') return 'bg-blue-50/60'
  if (colType === 'metric') return 'bg-emerald-50/60'
  return 'bg-slate-50'
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| External table lib (react-table v7) | TanStack Table v8 (headless) | 2022 | Headless means no styles — fully composable but requires more code |
| Manual column resize math | CSS resize handles + `useRef` mouse events | Ongoing standard | Mouse events on resize handle divs is the established pattern |
| Virtual scroll for large tables | React Window / TanStack Virtual | Current | For tables with >500 rows, virtualization is needed; <500 rows, native scroll is fine |

**Virtualization decision:** The CONTEXT.md marks this as Claude's discretion. Given typical experiment counts (10–200), native scroll (`overflow-auto` on container) is sufficient. If a project has >500 experiments, add `@tanstack/react-virtual` at that point. Do not add it preemptively — it adds complexity.

**Deprecated/outdated:**
- `react-table` v7 (2020 API): replaced by TanStack Table v8 — but we are not using either
- HTML5 drag API for reorder: replaced by `@dnd-kit` in this codebase

---

## Open Questions

1. **Column reorder for fixed vs dynamic columns**
   - What we know: Name must stay sticky-first; Type icon is trivial and should stay adjacent to Name
   - What's unclear: Should Status, Group, Created also be locked, or can they be reordered among themselves?
   - Recommendation: Lock only Name+TypeIcon as non-reorderable. Allow Status/Group/Created to be reordered among fixed columns. This keeps the UX flexible without complicating the sticky implementation.

2. **Inline new row: minimal form vs modal**
   - What we know: CONTEXT.md says Claude has discretion here
   - What's unclear: If the inline row only captures Name (required), the experiment is created with `status='planned'` and empty config/metrics — user fills the rest via inline editing. Is that sufficient?
   - Recommendation: Inline row captures Name only (one input), creates with `status='planned'`. User fills other fields via cell editing or the detail side panel. This matches Notion/Airtable's "quick add" pattern.

3. **Filter chip dropdown: custom or browser native `<select>`**
   - What we know: CONTEXT.md says "like Notion's filter bar" — implies custom chips
   - Recommendation: Custom chip UI using a `<div>` popover with `position: absolute`. Keep it lightweight — no Portal, no Floating UI. Use `useRef` + `onBlur` to close. This stays consistent with the codebase's approach (see `ExperimentStatusDropdown` which is a custom dropdown without a library).

---

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | `vite.config.js` (`test` key) |
| Setup file | `frontend/src/test/setup.js` |
| Quick run command | `cd frontend && npx vitest run src/pages/ProjectDetail.tableview.test.jsx` |
| Full suite command | `cd frontend && npx vitest run` |

### Phase Requirements → Test Map

This phase has no formal requirement IDs. Behaviors map to test contracts:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `buildColumns()` derives correct fixed + dynamic column list from flatTree | unit | `npx vitest run src/pages/ProjectDetail.tableview.test.jsx` | Wave 0 |
| `applyFilter()` correctly filters rows for each operator type | unit | same | Wave 0 |
| `sortRows()` sorts ascending/descending, nulls last | unit | same | Wave 0 |
| `applyFilter()` handles between operator | unit | same | Wave 0 |
| `applyFilter()` status multi-select (is / isnot) | unit | same | Wave 0 |
| Column state merge with localStorage defaults | unit | same | Wave 0 |
| `metricCellClass()` highlight best (reuse existing tests) | unit | `npx vitest run src/pages/ProjectDetail.comparemodal.test.jsx` | Exists |

### Sampling Rate

- **Per task commit:** `cd frontend && npx vitest run src/pages/ProjectDetail.tableview.test.jsx`
- **Per wave merge:** `cd frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/pages/ProjectDetail.tableview.test.jsx` — covers `buildColumns`, `applyFilter`, `sortRows`
- [ ] `frontend/src/hooks/useLocalStorage.js` — extract from `NoteGraphView.jsx` (if extracted; otherwise re-inline)

---

## Sources

### Primary (HIGH confidence)
- Codebase read: `frontend/src/pages/ProjectDetail.jsx` — all existing experiment helpers, KVEditor, CompareModal, ExperimentStatusDropdown patterns
- Codebase read: `frontend/package.json` + `node_modules/@dnd-kit/sortable/dist/strategies/` — confirmed `horizontalListSortingStrategy` is available in installed v10
- Codebase read: `frontend/src/components/NoteGraphView.jsx` — `useLocalStorage` hook implementation to extract
- Codebase read: `frontend/src/pages/Library.jsx` — table row/checkbox pattern reference
- Codebase read: `vite.config.js` — test configuration confirmed

### Secondary (MEDIUM confidence)
- @dnd-kit/sortable docs (training knowledge, verified by file listing): `horizontalListSortingStrategy` is the correct export for horizontal column DnD
- CSS `position: sticky` z-index layering: standard pattern, verified by reading codebase usage

### Tertiary (LOW confidence)
- None — all claims are verified against installed code

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed and version-checked
- Architecture: HIGH — all patterns derived from existing codebase code
- Pitfalls: HIGH — derived from codebase-specific patterns and CSS sticky gotchas
- Filter/sort logic: HIGH — simple client-side derived from spec

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable tech stack; no external API dependencies)
