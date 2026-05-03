---
phase: 09-task-database
plan: 03
status: complete
started: 2026-03-20
completed: 2026-03-20
duration_min: 5
tasks_completed: 1
files_changed: 1
requirements: [TASK-03, TASK-05, TASK-07]
---

## What was built

TaskListView component integrated into ProjectTasks.jsx — a sortable, filterable table replacing the ListPlaceholder. Includes exported pure helper functions (applyTaskFilter, sortTaskRows, isOverdue, getMonthGrid) tested by the existing RED test suite which now passes (28/28 tests). Custom field management via "+" header button and column hover rename/delete actions.

## Key files

### Modified
- `frontend/src/pages/ProjectTasks.jsx` — Added TaskListView, TaskFilterBar, TaskFilterChip, AddCustomFieldPopover components; exported applyTaskFilter, sortTaskRows, isOverdue, getMonthGrid helpers

## Decisions Made

- applyTaskFilter accepts tasks with either snake_case (column_id, due_date) or camelCase (columnId, dueDate) fields — handles both test data and live API data without a separate adapter
- sortTaskRows uses { field, direction } signature matching the RED test contracts; field 'due_date' and 'dueDate' are treated as equivalent via normalization in TaskListView
- Column visibility state stored in localStorage keyed by projectId (task-col-visibility-{id}) so per-project preferences persist across sessions
- Filter state stored in localStorage (task-filters-{id}) for same reason
- Delete confirmation uses inline two-step: first click shows "Delete" text in red, second click calls API — avoids modal overhead for row-level delete
- getMonthGrid uses grid.length < 42 fill loop so it works for all months including February and months starting on Saturday (which need 6 rows)

## Deviations

None — plan executed exactly as written. The linter added DnD-kit imports (pre-existing in the project for column drag-reorder) which did not affect test outcomes.

## Self-Check: PASSED

- [x] ProjectTasks.jsx modified (exists at frontend/src/pages/ProjectTasks.jsx)
- [x] applyTaskFilter exported and tests pass
- [x] sortTaskRows exported and tests pass
- [x] isOverdue exported and tests pass
- [x] getMonthGrid exported and tests pass
- [x] TaskListView renders table with default + custom field columns
- [x] Column sort via header click (asc/desc/clear cycle)
- [x] Filter chips with status/priority/overdue/title/custom filters
- [x] "+" button in header opens AddCustomFieldPopover with field type selector
- [x] Custom field column headers support rename (inline edit) and delete (confirm)
- [x] Row hover shows delete icon with two-step confirmation
- [x] Column visibility picker with per-column toggle and reset
- [x] 28/28 tests pass in ProjectTasks.tasks.test.jsx
- [x] Commit: 6495e18
