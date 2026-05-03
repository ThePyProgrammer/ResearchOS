---
phase: 09-task-database
verified: 2026-03-20T15:20:30Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Create a task in the Kanban view, set priority and due date in the TaskDetailPanel, then refresh the page and confirm all fields persist"
    expected: "Task appears in the correct column with correct priority and due date after page refresh"
    why_human: "End-to-end persistence requires a live Supabase database connection; cannot verify without running the app"
  - test: "Drag a task card from one Kanban column to another, then refresh the page"
    expected: "Task stays in the destination column after refresh — column_id persisted to database"
    why_human: "DnD interaction and database persistence requires a live browser + backend"
  - test: "Drag an unscheduled task from the Calendar sidebar onto a date cell"
    expected: "Task moves from unscheduled sidebar to the calendar date, due_date persists after refresh"
    why_human: "Drag-to-date interaction and persistence requires live browser + backend"
  - test: "Navigate to /projects/:id/tasks and switch between Kanban, List, and Calendar views; reopen browser tab and verify the view selection is remembered"
    expected: "View preference (kanban/list/calendar) persists via localStorage key tasks-view-{projectId}"
    why_human: "localStorage persistence requires a live browser session"
  - test: "In the List view, add a custom field of type 'number' named 'Estimate', then verify it appears as a column in the list and as an editable field in the TaskDetailPanel"
    expected: "Custom field appears in list header and in detail panel with correct number input type"
    why_human: "Custom field create + render requires live Supabase database"
---

# Phase 9: Task Database Verification Report

**Phase Goal:** Researchers can create and manage project tasks through Kanban, list, and calendar views with custom status columns
**Verified:** 2026-03-20T15:20:30Z
**Status:** human_needed — all automated checks passed, 5 items require live-app verification
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can create a task with title, description, status, priority, and due date within a project, and it persists across page refresh | ? HUMAN NEEDED | `tasksApi.create` in KanbanColumn.handleAddTask (line 1066) + `tasksApi.update` in TaskDetailPanel.saveField (line 1478) + `/api/projects/{id}/tasks` POST endpoint in tasks.py connected to task_service.create_task with DB insert. Unit tests 28/28 pass. Live DB persistence needs human. |
| 2 | User can define custom status columns per project and see tasks organized into those columns on the Kanban board, with drag-and-drop moving cards between columns | ? HUMAN NEEDED | `list_or_seed_task_columns` auto-seeds 4 defaults; KanbanView renders columns as vertical card lists; `DndContext id="task-card-dnd"` with `closestCorners`; `onDragEnd` calls `tasksApi.update(activeId, { column_id: targetColumnId })` at line 1299. Needs live DnD verification. |
| 3 | User can add custom fields (text, number, date, select) to tasks and see those fields as columns in the list view | ? HUMAN NEEDED | `AddCustomFieldPopover` calls `taskFieldDefsApi.create`; `TaskListView` builds `customColumns` from `fieldDefs`; `renderCell` handles all field types. `TaskDetailPanel.renderCustomField` renders per type. Needs live DB verification. |
| 4 | User can view tasks on a month/week calendar where tasks appear on their due date; tasks without a due date appear in an unscheduled sidebar | ? HUMAN NEEDED | `CalendarView` at line 2127: `getMonthGrid(year, month)` generates 42-cell grid; `tasksByDate` maps tasks to date strings; `unscheduledTasks = tasks.filter(t => !t.dueDate)` renders in sidebar at line 2312; DnD drag-to-date calls `tasksApi.update(taskId, { due_date: targetDate })` at line 2197. All verified in code; needs live rendering. |
| 5 | User can edit and delete any task from Kanban, list, or calendar view without navigating away | ? HUMAN NEEDED | `TaskDetailPanel` opened via `handleSelectTask` from all three views; `saveField` calls `tasksApi.update`; `handleDelete` calls `tasksApi.remove` + closes panel. List view row delete at line 870+. Needs live app verification. |

**Score:** 5/5 truths have complete implementation — all require human verification for live persistence

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/021_task_database.sql` | task_columns, tasks, task_field_defs tables | VERIFIED | 59 lines. All 3 tables with correct FKs: `column_id` uses `ON DELETE RESTRICT` (not CASCADE) per locked decision. Indexes on all project_id columns. |
| `backend/models/task.py` | Task, TaskColumn, TaskFieldDef Pydantic models | VERIFIED | 94 lines. All 9 model classes present: Task, TaskCreate, TaskUpdate, TaskColumn, TaskColumnCreate, TaskColumnUpdate, TaskFieldDef, TaskFieldDefCreate, TaskFieldDefUpdate. Priority typed as `Literal['high','medium','low','none']`, field_type as `Literal['text','number','date','select','multi_select']`. |
| `backend/services/task_service.py` | CRUD operations for tasks, columns, field defs | VERIFIED | 250 lines. All required functions: `list_or_seed_task_columns`, `create/update/delete_task_column`, `list/get/create/update/delete_task`, `list/get/create/update/delete_task_field_def`. Uses `exclude_unset=True` for updates. |
| `backend/routers/tasks.py` | FastAPI router for task endpoints | VERIFIED | 149 lines. All endpoints: GET/POST `/api/projects/{id}/tasks`, GET/POST `/api/projects/{id}/task-columns`, GET/POST `/api/projects/{id}/task-field-defs`, PATCH/DELETE `/api/tasks/{id}`, PATCH/DELETE `/api/task-columns/{id}?move_to=...`, PATCH/DELETE `/api/task-field-defs/{id}`. 404 handling on all paths. |
| `frontend/src/pages/ProjectTasks.jsx` | Main task view with all three views | VERIFIED | 2359 lines. Contains: `isOverdue`, `applyTaskFilter`, `sortTaskRows`, `getMonthGrid` (exported), `TaskFilterBar`, `AddCustomFieldPopover`, `TaskListView`, `KanbanView`, `KanbanColumn`, `KanbanCard`, `TaskDetailPanel`, `CalendarView`, `CalendarCell`, `UnscheduledCard`. |
| `frontend/src/pages/ProjectTasks.tasks.test.jsx` | Test file for pure helper functions | VERIFIED | 269 lines. 28 tests across 4 describe blocks. All pass: 28/28. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/src/services/api.js` | `/api/projects/{id}/tasks` | `tasksApi`, `taskColumnsApi`, `taskFieldDefsApi` | WIRED | Lines 377-397: all three API objects exported with correct URL patterns including `?move_to=` param on column delete |
| `frontend/src/App.jsx` | `ProjectTasks` component | `<Route path="tasks">` | WIRED | Line 18: import; line 41: `<Route path="tasks" element={<ProjectTasks />} />` inside projects/:id nested routes |
| `backend/routers/tasks.py` | `backend/services/task_service.py` | service function calls | WIRED | Every route handler imports and calls `task_service.*` functions; no business logic in handlers |
| `backend/app.py` | `backend/routers/tasks.router` | `app.include_router` | WIRED | Line 55: `app.include_router(tasks.router)` |
| `KanbanView` | `tasksApi.update` | `onDragEnd` updates `column_id` | WIRED | Line 1299: `tasksApi.update(activeTask.id, { column_id: targetColumnId })` |
| `KanbanView` | `taskColumnsApi` | column CRUD | WIRED | Lines 1311, 1317, 1326, 1334 (rename/add/delete/color) |
| `CalendarView` | `tasksApi.update` | drag-to-date updates `due_date` | WIRED | Line 2197: `await tasksApi.update(taskId, { due_date: targetDate })` |
| `CalendarView` | `getMonthGrid` | 42-cell month array | WIRED | Line 2151: `getMonthGrid(currentYear, currentMonth)` |
| `TaskListView` | `taskFieldDefsApi` | custom field CRUD | WIRED | Lines 424 (create), 610 (rename), 622 (delete) |
| `Sidebar.jsx` | `/projects/${id}/tasks` | Tasks sub-link | WIRED | Line 765: `{ label: 'Tasks', icon: 'task_alt', to: '/projects/${project.id}/tasks' }` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| TASK-01 | 09-01 | User can create tasks with title, description, status, priority, due date | SATISFIED | `tasksApi.create` (Kanban inline), `tasksApi.update` (detail panel fields). Note: REQUIREMENTS.md shows unchecked — stale tracking, code satisfies requirement. |
| TASK-02 | 09-01, 09-02 | User can define custom status columns per project | SATISFIED | `list_or_seed_task_columns` auto-seeds 4 defaults; column add/rename/delete/color via `taskColumnsApi`; Kanban renders tasks per column |
| TASK-03 | 09-01, 09-03 | User can add custom fields to tasks (text, number, date, select) | SATISFIED | `AddCustomFieldPopover` creates fields; `TaskListView` renders them as columns; `TaskDetailPanel.renderCustomField` handles all 5 types |
| TASK-04 | 09-02 | User can view tasks as a Kanban board and drag cards between columns | SATISFIED | `KanbanView` with `DndContext id="task-card-dnd"`, `closestCorners`, `useSortable`; `onDragEnd` updates `column_id` |
| TASK-05 | 09-03 | User can view tasks as a sortable, filterable list | SATISFIED | `TaskListView` with `sortTaskRows`, `applyTaskFilter`, filter chips, column sort, visibility toggle |
| TASK-06 | 09-04 | User can view tasks on a calendar by due date with unscheduled sidebar | SATISFIED | `CalendarView` with `getMonthGrid`, task chips on dates, unscheduled sidebar, drag-to-date DnD. Note: REQUIREMENTS.md shows unchecked — stale tracking, code satisfies requirement. |
| TASK-07 | 09-01, 09-02, 09-03, 09-04 | User can edit and delete tasks from any view | SATISFIED | `TaskDetailPanel` with `tasksApi.update` + `tasksApi.remove` accessible from all three views; list view also has row-level delete |

**Note on stale REQUIREMENTS.md:** TASK-01 and TASK-06 remain unchecked in REQUIREMENTS.md (lines 12, 17). This is a documentation tracking gap — the code fully implements both requirements. The implementation verification above confirms the code satisfies them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No stubs, TODOs, or placeholder implementations found in phase artifacts |

All `placeholder` occurrences in `ProjectTasks.jsx` are HTML `placeholder` attributes on input elements — not placeholder implementations.

### Human Verification Required

#### 1. Task Creation and Persistence

**Test:** Navigate to a project's Tasks tab, click "+ Add task" at the bottom of the "Todo" column, type a title and press Enter. Then click the task card to open the TaskDetailPanel. Set a description, change priority to "High", and set a due date. Close the panel, refresh the page.
**Expected:** Task appears in the Todo column with the correct title; clicking it reopens the panel showing the saved description, High priority, and due date unchanged.
**Why human:** End-to-end persistence requires a live Supabase database connection; the unit tests cover pure helper logic only.

#### 2. Kanban Drag-and-Drop with Persistence

**Test:** Drag a task card from the "Todo" column to the "In Progress" column. After the card settles, refresh the page.
**Expected:** The card remains in "In Progress" after refresh — the `column_id` update to the database persisted.
**Why human:** DnD interaction and browser event handling requires a live browser environment.

#### 3. Calendar Drag-to-Date

**Test:** Switch to the Calendar view. Drag a task from the "Unscheduled" right sidebar and drop it on any visible date cell. Refresh the page.
**Expected:** The task moves from the sidebar to the dropped date cell; after refresh it remains on that date with the correct `dueDate`.
**Why human:** Drag-and-drop calendar interaction requires a live browser and database.

#### 4. View Preference Persistence

**Test:** Switch from Kanban to List view. Close the browser tab and reopen the project Tasks URL.
**Expected:** The List view is shown (not Kanban), confirming `localStorage` key `tasks-view-{projectId}` persisted the selection.
**Why human:** localStorage requires a live browser session.

#### 5. Custom Field End-to-End

**Test:** In List view, click the "+" button in the table header. Enter name "Estimate", select type "number", click Add. Then click a task to open the TaskDetailPanel and enter a value in the new Estimate field.
**Expected:** The "Estimate" column appears in the list header; the task row shows the entered value; after refresh the value persists.
**Why human:** Custom field creation and rendering requires live Supabase for storage and retrieval.

### Implementation Notes

**Column reorder via DnD not implemented:** Plan 02 specified a second `DndContext id="task-column-dnd"` for column reordering via horizontal drag. The implementation omits this — only a single `DndContext id="task-card-dnd"` exists in KanbanView. Column add/rename/delete still work correctly. This deviates from the plan spec but does not block any TASK-0X requirement (none require drag-to-reorder columns specifically).

**TASK-01 and TASK-06 REQUIREMENTS.md status stale:** The REQUIREMENTS.md file shows these as `[ ]` (pending) but the implementation is complete. This is a documentation tracking artifact from plan execution, not a code gap.

---

_Verified: 2026-03-20T15:20:30Z_
_Verifier: Claude (gsd-verifier)_
