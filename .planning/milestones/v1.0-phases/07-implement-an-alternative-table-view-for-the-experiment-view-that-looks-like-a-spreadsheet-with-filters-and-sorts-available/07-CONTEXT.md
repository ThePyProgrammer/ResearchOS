# Phase 7: Experiment Table View - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

An alternative spreadsheet-like table view for experiments that complements the existing tree view. Flat table with columns for name, status, config keys, and metric keys, with filtering, sorting, column management, and inline editing. Users can switch between tree and table views.

</domain>

<decisions>
## Implementation Decisions

### Table Layout
- All experiments shown flat (both parents and leaves), not just leaves
- Type icon column distinguishes parents (folder icon) from leaves (science icon)
- Fixed columns: Name, Type icon, Status, Parent group name, Created date
- Dynamic columns: union of all config keys + union of all metric keys auto-detected
- Config column headers have a subtle blue tint, metric headers have a green tint (color-coded grouping)
- Sticky header row + sticky name column when scrolling
- Columns are resizable AND reorderable by dragging (full spreadsheet feel)
- Best metric values highlighted with toggle (same as CompareModal: "Highlight best" + per-metric lower-is-better toggle)

### Column Management
- Column picker: toolbar "Columns" button opens a dropdown checklist to show/hide columns
- "Reset columns" button in the picker to restore defaults
- '+' icon at the end of column headers to add a new config or metric key column
- When adding via '+', a dropdown lets user choose "Config" or "Metric" to determine JSONB field and header color
- Column visibility, order, and widths persisted in localStorage per project

### Row Interaction
- Clicking a row opens a side panel (slides in from right, like Library's PaperDetail) showing full experiment details (config, metrics, notes, linked papers)
- Checkbox multi-select on rows — reuses same selectedIds Set and floating action bar + CompareModal as tree view

### Filtering
- Filter bar above the table with dropdown chips (like Notion's filter bar)
- Status filter: multi-select from 4 statuses (planned/running/completed/failed)
- "Add filter" for any config/metric column
- Full operator set for numeric values: equals, not equals, greater than, less than, between, is empty, is not empty
- Filter state persisted in localStorage per project

### Sorting
- Click column header to sort: first click ascending, second descending, third clears
- Sort indicator arrow in the column header
- Single column sort at a time

### View Switching
- Icon toggle (tree/table) in the Experiments section header, next to the "Add Experiment" button
- View preference persisted in localStorage per project
- Selection state (checkboxes) carries over between tree and table views — shared selectedIds Set

### Adding Experiments
- Existing "Add Experiment" header button reused (opens ExperimentCreateModal)
- ALSO: inline "new row" at the bottom of the table with a '+' icon for spreadsheet-style quick add

### Inline Editing
- Double-click a cell to enter edit mode (input field appears, Enter to save, Escape to cancel)
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

</decisions>

<specifics>
## Specific Ideas

- Table should feel like a real data table / spreadsheet — think Notion database view or Airtable
- Color-coded config (blue headers) vs metric (green headers) columns make it instantly clear what's a parameter vs a result
- The '+' column button is key for the workflow of "I want to track a new metric across all experiments"
- Inline new-row at the bottom enables a rapid "add experiment, fill in config" workflow without opening a modal

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CompareModal` + `unionKeys()` + `metricCellClass` + `configCellClass`: Already builds union-of-keys tables for metrics and config — same logic needed for table columns
- `experimentStatusConfig`: 4 status definitions with color classes — reuse for status badge column
- `ExperimentStatusDropdown`: Inline status editor — reuse in table status column
- `ExperimentCreateModal`: Modal for creating experiments — reuse from header button
- `selectedLeafIds` Set + floating action bar + `CompareModal`: Existing comparison flow to share with table view
- `getEffectiveConfig()` + `buildParentMap()`: Config inheritance helpers if table should show inherited values
- `KVEditor`: Key-value editor pattern — reference for inline cell editing UX
- Library page table in `Library.jsx`: Table with search, status filter, multi-select, bulk actions — reference pattern

### Established Patterns
- `experimentsApi` in `api.js`: All experiment CRUD methods already available
- `buildExperimentTree()` / `flattenExperimentTree()`: Tree-building already provides flat list with `_parentId` metadata
- `aggregateDescendants()`: Parent summary logic for status counts and metric ranges
- localStorage for preferences: `activeLibrary` pattern in `LibraryContext.jsx`

### Integration Points
- `ExperimentSection` in `ProjectDetail.jsx`: Add view toggle state, render either tree or table based on mode
- `selectedLeafIds` state: Lift to `ExperimentSection` (already there) so both views share it
- `flatTree` array from `flattenExperimentTree()`: Direct data source for table rows
- Side panel: New component, renders inside `ExperimentSection` when a row is clicked

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-experiment-table-view*
*Context gathered: 2026-03-16*
