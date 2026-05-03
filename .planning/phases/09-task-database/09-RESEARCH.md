# Phase 9: Task Database - Research

**Researched:** 2026-03-20
**Domain:** Project-scoped task management — Kanban, List, Calendar views with custom status columns and custom fields
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Kanban Board Layout**
- One column per custom status — drag card between columns = change status
- Card content: title, due date (red if overdue), first 1-2 custom field values as chips. No priority indicator on card.
- Click card → side panel (same pattern as experiment detail and Library paper detail) — shows all fields, editable inline
- Add card button per column — "+ Add task" at bottom of each column, inline name input, Enter to create with that column's status
- No priority indicator on cards (priority is a field visible in detail panel and list view)

**Task Fields & Custom Columns**
- Default fields: title, status (custom columns), description (rich text), priority (High/Medium/Low/None), due date, tags (multi-select)
- Custom field types: text (single line), number, date, select (single), multi-select
- Add custom fields via "+" button at end of list view header row — same pattern as experiment table view column management
- Custom status management: inline — click column header to rename, drag to reorder, "+" to add new status, delete moves tasks to adjacent column. Colors auto-assigned or user-picked.

**Calendar View**
- Default: month view with colored chips (status color) showing truncated task title
- Max 3 chips per day, "+N more" overflow — click to see full list
- Unscheduled sidebar: right panel with draggable task cards (tasks without due date). Drag onto calendar date to assign.
- Drag to reschedule: dragging a task chip from one date to another updates its due date
- Click chip → same side panel as Kanban and list views

**View Switching & Navigation**
- New "Tasks" tab alongside Overview / Literature / Experiments / Notes — route: `/projects/:id/tasks`
- Sidebar sub-link added to collapsible project nodes (icon: `task_alt` or similar)
- Toggle buttons in header — icon buttons for Kanban (view_kanban), List (view_list), Calendar (calendar_month). Same pattern as experiment tree/table toggle. Preference persisted per project via localStorage.
- List view reuses the same FilterBar component and filter chip pattern from experiment table view

### Claude's Discretion
- Exact card shadow/border styling
- Column header color picker implementation
- Calendar navigation (prev/next month buttons, today button)
- Loading states and empty states per view
- Task sort order within Kanban columns (manual drag, or by priority/date)
- Detail panel width and layout

### Deferred Ideas (OUT OF SCOPE)
- Task-to-experiment linking (TASK-08 in v2 requirements)
- Task templates (TASK-09 in v2 requirements)
- Timeline / Gantt view (TASK-10 in v2 requirements)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TASK-01 | User can create tasks with title, description, status, priority, and due date within a project | DB schema + service CRUD pattern from experiment_service.py |
| TASK-02 | User can define custom status columns per project (e.g., Todo, In Progress, Review, Done) | task_columns table with stable ID PK; column_id FK in tasks (prevents rename corruption) |
| TASK-03 | User can add custom fields to tasks (text, number, date, select types) | JSONB custom_fields pattern from experiments.config; custom_field_defs JSONB on project |
| TASK-04 | User can view tasks as a Kanban board and drag cards between status columns | @dnd-kit/core + @dnd-kit/sortable already installed; DndContext pattern from ExperimentSection |
| TASK-05 | User can view tasks as a sortable, filterable list with all fields as columns | FilterBar + FilterChip reuse from ExperimentTableView; ColumnPicker pattern |
| TASK-06 | User can view tasks on a calendar (month/week) by due date with an unscheduled sidebar | Hand-built month calendar grid + @dnd-kit for sidebar drag-to-date |
| TASK-07 | User can edit and delete tasks from any view | Shared TaskDetailPanel (side panel pattern from ExperimentDetailPanel) |
</phase_requirements>

---

## Summary

Phase 9 adds a project-scoped task database with three views — Kanban board, filterable list, and month calendar — plus custom status columns and custom fields. The scope is pure client-side/backend CRUD with no new external dependencies; everything needed is already installed or follows established patterns.

The primary technical challenge is the **data model**. Two design decisions are pre-locked and critical: (1) status columns live in a separate `task_columns` table with stable ID PKs so renaming a column does not corrupt task data, and (2) the migration number 021 is already claimed. Custom fields are stored as JSONB on the project (schema definition) and on each task (field values), mirroring the experiment `config`/`metrics` JSONB pattern.

The implementation divides cleanly into: backend (migration + models + service + router), list view (reusing FilterBar/ColumnPicker from ExperimentTableView), Kanban board (DndContext over columns + sortable cards), and calendar (hand-built month grid + sidebar DnD). The side panel (TaskDetailPanel) is shared across all three views — same pattern as ExperimentDetailPanel.

**Primary recommendation:** Follow the experiment service/router/model stack exactly. The task schema is simpler (no parent/child tree, no metrics) so this phase is mostly application of established patterns with one novel piece — the calendar month grid.

---

## Standard Stack

### Core (all already installed — no new npm installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.3.1 | Drag contexts for Kanban columns and calendar sidebar | Already used for experiment tree + table column DnD |
| @dnd-kit/sortable | ^10.0.0 | Sortable card lists within Kanban columns | Already used for experiment sortable rows |
| @dnd-kit/utilities | ^3.2.2 | CSS transform helpers for drag overlays | Already present |
| React 18 + Vite | existing | Component tree, hooks | Project standard |
| Tailwind CSS 3 | existing | Styling | Project standard |
| Material Symbols Outlined | CDN | Icons: `task_alt`, `view_kanban`, `view_list`, `calendar_month` | Project icon system |

### Backend (no new Python packages)

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| FastAPI + Pydantic CamelModel | existing | Router + typed models | Project standard — every entity follows this |
| Supabase (PostgreSQL + JSONB) | existing | tasks + task_columns tables | Established pattern for all domain objects |
| uv | existing | Package manager | Project standard |

### No New Dependencies Required

The calendar view is hand-built as a React component (month grid with `date-fns`-style logic using native JS `Date`). No calendar library is needed because:
- Month grid is a simple 6×7 cell layout
- Drag-to-date reuses @dnd-kit already installed
- No week/day view required (month only per CONTEXT.md)

---

## Architecture Patterns

### Recommended Project Structure

```
backend/
├── migrations/
│   └── 021_task_database.sql     # task_columns + tasks tables (migration 021 is claimed)
├── models/
│   └── task.py                   # Task, TaskColumn, TaskCreate, TaskUpdate, TaskColumnCreate, TaskColumnUpdate
├── services/
│   └── task_service.py           # CRUD for tasks + task_columns
└── routers/
    └── tasks.py                  # project-scoped + task-scoped endpoints

frontend/src/
├── pages/
│   ├── ProjectDetail.jsx         # Add sectionLabels['tasks'] = 'Tasks' in breadcrumb; export ProjectTasks
│   └── ProjectTasks.jsx          # NEW: KanbanView, ListView, CalendarView + shared TaskDetailPanel
├── services/
│   └── api.js                    # Add tasksApi + taskColumnsApi
└── components/layout/
    └── Sidebar.jsx               # Add Tasks sub-link to project subLinks array
```

### Pattern 1: Database Schema — Stable Column IDs

**What:** `task_columns` table holds status definitions. `tasks.column_id` references `task_columns.id`, NOT the display name string. Custom field schemas stored as JSONB on `task_columns_meta` or project level.

**When to use:** Always. Renaming a column must not require updating every task row.

```sql
-- Source: STATE.md locked decision + experiment migration pattern (019_experiments.sql)

CREATE TABLE IF NOT EXISTS task_columns (
    id          TEXT PRIMARY KEY,          -- e.g. tcol_abc12345
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#94a3b8',  -- Tailwind slate-400 hex
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,             -- e.g. task_abc12345
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    column_id       TEXT NOT NULL REFERENCES task_columns(id) ON DELETE RESTRICT,
    title           TEXT NOT NULL,
    description     TEXT,                         -- HTML from tiptap or plain text
    priority        TEXT NOT NULL DEFAULT 'none', -- 'high'|'medium'|'low'|'none'
    due_date        TEXT,                         -- ISO date string YYYY-MM-DD or NULL
    tags            JSONB NOT NULL DEFAULT '[]',  -- string array
    custom_fields   JSONB NOT NULL DEFAULT '{}',  -- field_def_id -> value
    position        INTEGER NOT NULL DEFAULT 0,   -- sort within column
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Custom field definitions stored per-project as JSONB array on a new table
-- (avoids schema migrations for each new field type)
CREATE TABLE IF NOT EXISTS task_field_defs (
    id          TEXT PRIMARY KEY,             -- e.g. tfd_abc12345
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    field_type  TEXT NOT NULL,               -- 'text'|'number'|'date'|'select'|'multi_select'
    options     JSONB NOT NULL DEFAULT '[]', -- for select/multi_select: ["Option A", "Option B"]
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
```

**CRITICAL:** `column_id` uses `ON DELETE RESTRICT` — deleting a column that still has tasks must fail at DB level. The service must move tasks to an adjacent column before deleting, then delete the column. This is the correct pattern (user decision: "delete moves tasks to adjacent column").

### Pattern 2: Backend Model + Service (mirrors experiment pattern)

```python
# Source: backend/models/experiment.py + backend/services/experiment_service.py

# backend/models/task.py
from typing import Any, Literal, Optional
from .base import CamelModel

class TaskColumn(CamelModel):
    id: str
    project_id: str
    name: str
    color: str = '#94a3b8'
    position: int = 0
    created_at: str

class TaskColumnCreate(CamelModel):
    name: str
    color: str = '#94a3b8'

class TaskColumnUpdate(CamelModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None

class Task(CamelModel):
    id: str
    project_id: str
    column_id: str
    title: str
    description: Optional[str] = None
    priority: Literal['high', 'medium', 'low', 'none'] = 'none'
    due_date: Optional[str] = None
    tags: list[str] = []
    custom_fields: dict[str, Any] = {}
    position: int = 0
    created_at: str
    updated_at: str

class TaskFieldDef(CamelModel):
    id: str
    project_id: str
    name: str
    field_type: Literal['text', 'number', 'date', 'select', 'multi_select']
    options: list[str] = []
    position: int = 0
    created_at: str
```

### Pattern 3: Router Shape (project-scoped + task-scoped)

```python
# Source: backend/routers/experiments.py — exact same dual-scope pattern

# Project-scoped (require project existence check):
POST   /api/projects/{project_id}/tasks
GET    /api/projects/{project_id}/tasks
POST   /api/projects/{project_id}/task-columns
GET    /api/projects/{project_id}/task-columns
POST   /api/projects/{project_id}/task-field-defs
GET    /api/projects/{project_id}/task-field-defs

# Task-scoped (404 if task not found):
PATCH  /api/tasks/{task_id}
DELETE /api/tasks/{task_id}

# Column-scoped:
PATCH  /api/task-columns/{column_id}
DELETE /api/task-columns/{column_id}    # service must move tasks first

# Field def scoped:
PATCH  /api/task-field-defs/{def_id}
DELETE /api/task-field-defs/{def_id}
```

### Pattern 4: Frontend API Client

```javascript
// Source: frontend/src/services/api.js — experimentsApi shape

export const tasksApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/tasks`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/tasks`, { method: 'POST', body: data }),
  update: (taskId, data) => apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: data }),
  remove: (taskId) => apiFetch(`/tasks/${taskId}`, { method: 'DELETE' }),
}

export const taskColumnsApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/task-columns`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/task-columns`, { method: 'POST', body: data }),
  update: (colId, data) => apiFetch(`/task-columns/${colId}`, { method: 'PATCH', body: data }),
  remove: (colId, moveToColId) => apiFetch(`/task-columns/${colId}?move_to=${moveToColId}`, { method: 'DELETE' }),
}

export const taskFieldDefsApi = {
  list: (projectId) => apiFetch(`/projects/${projectId}/task-field-defs`),
  create: (projectId, data) => apiFetch(`/projects/${projectId}/task-field-defs`, { method: 'POST', body: data }),
  update: (defId, data) => apiFetch(`/task-field-defs/${defId}`, { method: 'PATCH', body: data }),
  remove: (defId) => apiFetch(`/task-field-defs/${defId}`, { method: 'DELETE' }),
}
```

### Pattern 5: Route + Outlet Export (mirrors ProjectExperiments)

```javascript
// Source: frontend/src/App.jsx + ProjectDetail.jsx export pattern

// In App.jsx — add inside the projects/:id nested routes:
import ProjectTasks from './pages/ProjectTasks'
// ...
<Route path="tasks" element={<ProjectTasks />} />

// In ProjectDetail.jsx — add to sectionLabels and export:
const sectionLabels = { literature: 'Literature', experiments: 'Experiments', notes: 'Notes', tasks: 'Tasks' }

// New export (same shell as ProjectExperiments):
export function ProjectTasksWrapper() {
  const { project } = useOutletContext()
  return <ProjectTasks projectId={project.id} />
}
```

### Pattern 6: Sidebar Sub-Link

```javascript
// Source: frontend/src/components/layout/Sidebar.jsx — subLinks array (line 761)

const subLinks = [
  { label: 'Overview',    icon: 'dashboard',  to: `/projects/${project.id}`,             end: true },
  { label: 'Literature',  icon: 'menu_book',  to: `/projects/${project.id}/literature`,  end: false },
  { label: 'Experiments', icon: 'science',    to: `/projects/${project.id}/experiments`, end: false },
  { label: 'Tasks',       icon: 'task_alt',   to: `/projects/${project.id}/tasks`,       end: false },  // ADD
  { label: 'Notes',       icon: 'edit_note',  to: `/projects/${project.id}/notes`,       end: false },
]
```

### Pattern 7: Kanban Drag — DnD Context Architecture

**What:** Two nested DnD contexts — outer for column reordering, inner for card movement within/between columns.

**Correct @dnd-kit approach for cross-container drag (Kanban):**

```javascript
// Source: @dnd-kit documentation pattern for multi-container sortable
// DndContext at the Kanban board level
// Each column is a SortableContext (column cards)
// onDragEnd: if activeContainer !== overContainer → move card + PATCH task column_id
//            if same container → reorder (update position)

import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

// Card dragging: use useSortable, listen for drag between columns via over.id
// Column reordering: separate DndContext with id="column-dnd" (same pattern as
//   ExperimentTableView column DnD — avoids collision with card DnD)
```

**Key detail:** `closestCorners` collision detection (not `closestCenter`) works better for cards in vertical lists inside columns because `closestCenter` can misfire when a card is dragged near column edges.

### Pattern 8: Calendar Month Grid

**What:** Hand-built month grid — 6 rows × 7 columns of date cells. No external library.

```javascript
// Pure JS — no date-fns required (but already available if needed via native Date)

function getMonthGrid(year, month) {
  // month: 0-indexed JS Date month
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startOffset + 1
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null) // padding cells
    } else {
      cells.push(new Date(year, month, dayNum))
    }
  }
  return cells // always 42 cells (6 rows)
}
```

**Calendar drag (assign due date):** Use `@dnd-kit/core` — each date cell is a `useDroppable` target. Unscheduled sidebar cards and existing chip-cards are `useDraggable`. On drop, call `tasksApi.update(taskId, { due_date: targetDate })`.

**Note:** Calendar drag does NOT use `SortableContext` (no sorting within a day cell). Use raw `useDraggable` + `useDroppable` hooks from `@dnd-kit/core`.

### Pattern 9: Seed Default Columns

When the first task view is opened for a project with no `task_columns`, auto-seed defaults in the service layer:

```python
# In list_task_columns: if result is empty, create defaults and return them
DEFAULT_COLUMNS = [
    ("Todo", "#93c5fd"),       # blue-300
    ("In Progress", "#fbbf24"), # amber-400
    ("Review", "#a78bfa"),      # violet-400
    ("Done", "#4ade80"),        # green-400
]
```

This avoids a separate "initialize project" call from the frontend and is consistent with how the backend seeds data at startup.

### Anti-Patterns to Avoid

- **Storing column name as task field:** `tasks.status = "Todo"` is corrupt — rename breaks everything. Always use `column_id` FK.
- **Using `closestCenter` for Kanban card DnD:** Misfire near column edges. Use `closestCorners` for multi-container layouts.
- **Single DnD context for both column reorder and card move:** Creates event ambiguity. Use separate `DndContext` IDs (same pattern as `column-dnd` in ExperimentTableView).
- **Calendar library import:** Not needed for month-only view. Hand-built grid is 30 lines of JS and avoids bundle bloat.
- **Rich text editor for task description in the detail panel:** The side panel description field should use a simple `<textarea>` or a minimal tiptap instance — NOT the full NotesPanel. NotesPanel is overkill for a single description field.
- **`ON DELETE CASCADE` on `column_id` FK:** This silently deletes all tasks when a column is removed. Use `ON DELETE RESTRICT` and move tasks in the service layer before deleting the column.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag cards between Kanban columns | Custom mouse event tracking | @dnd-kit/core DndContext + useSortable | Touch support, keyboard accessibility, DragOverlay, already installed |
| Drag-to-date in calendar | Custom mouse position math | @dnd-kit/core useDraggable + useDroppable | Consistent with existing DnD, handles pointer sensors |
| Month grid date math | Custom calendar utility | Native JS Date | `new Date(year, month, 1).getDay()`, `new Date(year, month+1, 0).getDate()` — sufficient, no library needed |
| Status badge colors | Custom color management | JSONB color field on task_columns | User picks color per column; stored in DB; CSS inline style on chip |
| List view column management | New component | ColumnPicker from ProjectDetail.jsx | Already exists, already handles drag-reorder + visibility toggle |
| List view filtering | New component | FilterBar + FilterChip from ProjectDetail.jsx | Already parameterized for arbitrary column definitions |

**Key insight:** ~70% of the list view UI code already exists in `ProjectDetail.jsx`'s `ExperimentTableView`. The task list view is essentially ExperimentTableView with `tasks` data instead of `experiments` data and a different column set.

---

## Common Pitfalls

### Pitfall 1: Rename Corruption (column name as key)

**What goes wrong:** If `tasks.status` stores the string `"Todo"` and the user renames the column to `"Backlog"`, every task now has a stale status value.
**Why it happens:** Using display names as data keys instead of stable IDs.
**How to avoid:** `tasks.column_id` is a FK to `task_columns.id`. The ID never changes. The display name lives only in `task_columns.name`.
**Warning signs:** If you see `tasks.status = "Todo"` in any migration draft, it's wrong.

### Pitfall 2: Wrong Migration Number

**What goes wrong:** Using migration 020 (already taken by `020_project_notes_copilot.sql`) causes a conflict.
**How to avoid:** Use 021. The STATE.md confirms: "Migration number 021 claimed for task database; range 021-025 reserved for v1.1."

### Pitfall 3: DnD Context ID Collisions

**What goes wrong:** A single top-level DnD context for both column reordering and card moving causes sensors to fire on the wrong elements.
**How to avoid:** Use separate `DndContext` with `id="task-column-dnd"` for column reordering and `id="task-card-dnd"` for card drag within/between columns. This mirrors how `ExperimentTableView` uses `id="column-dnd"` for its header row.

### Pitfall 4: ON DELETE CASCADE on column_id

**What goes wrong:** Deleting a task column silently deletes all tasks in that column.
**How to avoid:** Use `ON DELETE RESTRICT` for the `column_id` FK. The service's `delete_task_column` function must reassign all tasks to the adjacent column first, then delete. Include a `move_to_column_id` param on the delete endpoint.

### Pitfall 5: Calendar Padding Cells

**What goes wrong:** The month grid has cells before day 1 and after last day. If you attempt to render tasks for `null` date cells, you get crashes.
**How to avoid:** `getMonthGrid()` returns `null` for padding cells. Always guard: `if (cell === null) return <EmptyCell />`.

### Pitfall 6: Overdue Date Comparison in the Browser

**What goes wrong:** Comparing `new Date(task.due_date)` with `new Date()` in the browser includes time-of-day, making tasks due "today" show as overdue mid-day.
**How to avoid:** Compare date strings only: `task.due_date < today` where `today = new Date().toISOString().split('T')[0]`. This gives a stable YYYY-MM-DD comparison.

### Pitfall 7: Position Field Consistency After Column Delete

**What goes wrong:** After deleting a column and moving its tasks, positions within the target column are not compacted, leaving gaps.
**How to avoid:** When moving tasks to an adjacent column on delete, append them at the end (max existing position + 1 per task). Or compact all positions after the move.

---

## Code Examples

### Creating the first default columns (seed pattern)

```python
# Source: app.py SEED pattern + experiment_service.py create pattern

def list_or_seed_task_columns(project_id: str) -> list[TaskColumn]:
    """Return columns for project; seed defaults if none exist."""
    result = (
        get_client().table("task_columns")
        .select("*")
        .eq("project_id", project_id)
        .order("position")
        .execute()
    )
    if result.data:
        return [TaskColumn.model_validate(r) for r in result.data]
    # Seed defaults
    defaults = [
        ("Todo", "#93c5fd"),
        ("In Progress", "#fbbf24"),
        ("Review", "#a78bfa"),
        ("Done", "#4ade80"),
    ]
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    columns = []
    for pos, (name, color) in enumerate(defaults):
        col = TaskColumn(
            id=f"tcol_{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            name=name,
            color=color,
            position=pos,
            created_at=now,
        )
        get_client().table("task_columns").insert(col.model_dump(by_alias=False)).execute()
        columns.append(col)
    return columns
```

### Kanban card drop handler (cross-column)

```javascript
// Source: @dnd-kit multi-container sortable pattern

function handleDragEnd(event) {
  const { active, over } = event
  if (!over) return

  const activeCard = tasks.find(t => t.id === active.id)
  const overColumnId = over.data.current?.columnId || over.id // over is a column droppable

  if (activeCard && overColumnId !== activeCard.columnId) {
    // Cross-column drop: update status
    tasksApi.update(activeCard.id, { column_id: overColumnId })
      .then(() => setTasks(prev =>
        prev.map(t => t.id === activeCard.id ? { ...t, columnId: overColumnId } : t)
      ))
      .catch(err => console.error('Failed to move task:', err))
  }
}
```

### Month calendar day cell rendering

```javascript
// Overdue detection — stable string comparison
const today = new Date().toISOString().split('T')[0]

function TaskChip({ task, column, onClick }) {
  const isOverdue = task.dueDate && task.dueDate < today
  return (
    <button
      onClick={() => onClick(task)}
      className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium ${
        isOverdue ? 'bg-red-100 text-red-700' : 'text-white'
      }`}
      style={isOverdue ? {} : { backgroundColor: column?.color || '#94a3b8' }}
    >
      {task.title}
    </button>
  )
}
```

### View toggle with localStorage persistence

```javascript
// Source: useLocalStorage hook (frontend/src/hooks/useLocalStorage.js) + ExperimentSection pattern

const [taskView, setTaskView] = useLocalStorage(`tasks-view-${projectId}`, 'kanban')
// taskView: 'kanban' | 'list' | 'calendar'
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Build a calendar with a full library (e.g., FullCalendar) | Hand-build month grid with native JS Date + @dnd-kit | No new dependency; month-only view is simple enough to hand-build |
| Store status as string field | Stable FK to task_columns.id | Rename-safe; rename requires only one row update in task_columns |

---

## Open Questions

1. **Column delete UX when no adjacent column exists**
   - What we know: "delete moves tasks to adjacent column"
   - What's unclear: What if only one column remains? Should delete be blocked?
   - Recommendation: Disable delete button when only one column exists (minimum 1 column constraint enforced in UI, not just DB)

2. **Rich text vs plain text for task description**
   - What we know: CONTEXT.md says "description (rich text)"
   - What's unclear: Full tiptap editor or just textarea with newlines?
   - Recommendation: Use a lightweight tiptap instance (starter-kit only, no math/tables extensions) in the detail panel. Same approach as the inline experiment description field. This keeps it consistent with the "rich text" intent without the full NotesPanel overhead.

3. **Task position after cross-column drag**
   - What we know: Tasks have a `position` field within their column
   - What's unclear: When dragging to a new column, insert at the dragged-over position or append at bottom?
   - Recommendation: Append at bottom of target column on cross-column drag (simpler). Within-column drag uses position reorder. This is the Linear-like behavior the CONTEXT.md references.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | vite.config.js (vitest config inline) |
| Quick run command | `npm run test:run -- ProjectTasks` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASK-01 | Task creation with all default fields | unit | `npm run test:run -- ProjectTasks.tasks.test` | ❌ Wave 0 |
| TASK-02 | Custom status column CRUD | unit | `npm run test:run -- ProjectTasks.tasks.test` | ❌ Wave 0 |
| TASK-03 | Custom field types stored/retrieved correctly | unit | `npm run test:run -- ProjectTasks.tasks.test` | ❌ Wave 0 |
| TASK-04 | Kanban card moves between columns (DnD state update) | unit | `npm run test:run -- ProjectTasks.tasks.test` | ❌ Wave 0 |
| TASK-05 | List view sort/filter helper functions | unit | `npm run test:run -- ProjectTasks.tasks.test` | ❌ Wave 0 |
| TASK-06 | `getMonthGrid` returns correct 42-cell array | unit | `npm run test:run -- ProjectTasks.tasks.test` | ❌ Wave 0 |
| TASK-07 | Task delete removes from all views | unit | `npm run test:run -- ProjectTasks.tasks.test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:run -- ProjectTasks.tasks.test`
- **Per wave merge:** `npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/pages/ProjectTasks.tasks.test.jsx` — covers TASK-01 through TASK-07 (pure function tests: `getMonthGrid`, `isOverdue`, column/card state helpers, filter/sort)
- [ ] Export helper functions from `ProjectTasks.jsx` for unit testability (same pattern as `buildColumns`/`applyFilter`/`sortRows` exported from `ProjectDetail.jsx`)

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `frontend/src/pages/ProjectDetail.jsx` — ExperimentDetailPanel, FilterBar, FilterChip, ColumnPicker, ExperimentSection, ExperimentTableView, DnD patterns, useOutletContext
- Direct code inspection: `backend/services/experiment_service.py` — CRUD pattern with uuid prefix, position ordering, update with exclude_unset
- Direct code inspection: `backend/migrations/019_experiments.sql` — table structure, index strategy, ON DELETE CASCADE, JSONB defaults
- Direct code inspection: `frontend/src/services/api.js` — experimentsApi shape as template for tasksApi
- Direct code inspection: `frontend/src/components/layout/Sidebar.jsx` — subLinks array (line 761)
- Direct code inspection: `frontend/src/App.jsx` — nested route structure for ProjectDetail tabs
- Direct code inspection: `frontend/src/hooks/useLocalStorage.js` — useLocalStorage hook
- Direct code inspection: `frontend/package.json` — @dnd-kit/core 6.3.1, @dnd-kit/sortable 10.0.0 confirmed installed
- `.planning/phases/09-task-database/09-CONTEXT.md` — all locked decisions
- `.planning/STATE.md` — migration 021 claimed, column_id stable ID decision confirmed

### Secondary (MEDIUM confidence)

- @dnd-kit documentation patterns for multi-container sortable (Kanban) — `closestCorners` collision strategy, cross-container drag handling

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already installed and in use
- Architecture: HIGH — directly mirrors experiment pattern with code verified in the codebase
- Pitfalls: HIGH — most are confirmed from STATE.md decisions and code inspection; calendar pitfalls are standard calendar-grid problems
- Calendar grid: HIGH — month grid is a known solved pattern; no external library needed for month-only

**Research date:** 2026-03-20
**Valid until:** 2026-06-20 (stable stack; no time-sensitive APIs)
