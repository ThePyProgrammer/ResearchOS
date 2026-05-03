# Phase 9: Task Database - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Project-scoped task database with custom status columns, custom fields, and three views: Kanban board, sortable/filterable list, and month calendar with unscheduled sidebar. Tasks are a new entity type within projects — separate from experiments and notes. This phase does NOT add task-to-experiment linking, task templates, or timeline/Gantt view.

</domain>

<decisions>
## Implementation Decisions

### Kanban Board Layout
- **One column per custom status** — drag card between columns = change status
- **Card content:** title, due date (red if overdue), first 1-2 custom field values as chips. No priority indicator on card.
- **Click card → side panel** (same pattern as experiment detail and Library paper detail) — shows all fields, editable inline
- **Add card button per column** — "+ Add task" at bottom of each column, inline name input, Enter to create with that column's status
- No priority indicator on cards (priority is a field visible in detail panel and list view)

### Task Fields & Custom Columns
- **Default fields:** title, status (custom columns), description (rich text), priority (High/Medium/Low/None), due date, tags (multi-select)
- **Custom field types:** text (single line), number, date, select (single), multi-select
- **Add custom fields** via "+" button at end of list view header row — same pattern as experiment table view column management
- **Custom status management:** inline — click column header to rename, drag to reorder, "+" to add new status, delete moves tasks to adjacent column. Colors auto-assigned or user-picked.

### Calendar View
- **Default:** month view with colored chips (status color) showing truncated task title
- **Max 3 chips per day**, "+N more" overflow — click to see full list
- **Unscheduled sidebar:** right panel with draggable task cards (tasks without due date). Drag onto calendar date to assign.
- **Drag to reschedule:** dragging a task chip from one date to another updates its due date
- **Click chip → same side panel** as Kanban and list views

### View Switching & Navigation
- **New "Tasks" tab** alongside Overview / Literature / Experiments / Notes — route: `/projects/:id/tasks`
- **Sidebar sub-link** added to collapsible project nodes (icon: `task_alt` or similar)
- **Toggle buttons in header** — icon buttons for Kanban (view_kanban), List (view_list), Calendar (calendar_month). Same pattern as experiment tree/table toggle. Preference persisted per project via localStorage.
- **List view** reuses the same FilterBar component and filter chip pattern from experiment table view

### Claude's Discretion
- Exact card shadow/border styling
- Column header color picker implementation
- Calendar navigation (prev/next month buttons, today button)
- Loading states and empty states per view
- Task sort order within Kanban columns (manual drag, or by priority/date)
- Detail panel width and layout

</decisions>

<specifics>
## Specific Ideas

- Kanban should feel like Linear's board — clean cards, smooth drag, not cluttered
- Calendar unscheduled sidebar should be similar to Google Calendar's drag-from-sidebar pattern
- List view should be instantly familiar to users of the experiment table view — same filter chips, same sort arrows, same column management
- The "+" button to add custom fields in list view header mirrors the experiment table's "+" column button

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@dnd-kit/core` + `@dnd-kit/sortable`: Already installed, used in experiment tree + Kanban-ready
- `FilterBar` + `FilterChip` in `ProjectDetail.jsx`: Reuse for task list view filtering
- `ExperimentDetailPanel` pattern: Side panel with editable fields — reference for task detail panel
- `ExperimentTableView` column management: `ColumnPicker`, inline header "+", drag reorder — reuse pattern for task list
- `useLocalStorage` hook: Persist view preference per project
- `detectType` in `utils/detectType.js`: Type coercion for custom field values

### Established Patterns
- CamelModel Pydantic models with service layer + router pattern
- `experimentsApi` in api.js: Reference for `tasksApi` shape
- `WindowModal` for any modal needs
- `ProjectDetail.jsx` Outlet pattern for tab routing

### Integration Points
- `App.jsx`: Add `/projects/:id/tasks` route inside ProjectDetail nested routes
- `Sidebar.jsx`: Add "Tasks" sub-link to project collapsible nodes
- `ProjectDetail.jsx`: Add `ProjectTasks` export using `useOutletContext()`
- Backend: Migration 021 for `task_columns` + `tasks` tables
- `api.js`: Add `tasksApi` and `taskColumnsApi`

</code_context>

<deferred>
## Deferred Ideas

- Task-to-experiment linking (TASK-08 in v2 requirements)
- Task templates (TASK-09 in v2 requirements)
- Timeline / Gantt view (TASK-10 in v2 requirements)

</deferred>

---

*Phase: 09-task-database*
*Context gathered: 2026-03-20*
