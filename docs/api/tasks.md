# Tasks API

The task system provides a kanban-style board for each project. Each project has a set of `task_columns` (status lanes), `tasks` (cards), and optionally `task_field_defs` (custom fields).

---

## Task Columns

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/task-columns` | List columns for a project (seeds defaults if empty) |
| POST | `/api/projects/{id}/task-columns` | Create a new column |
| PATCH | `/api/task-columns/{id}` | Update a column |
| DELETE | `/api/task-columns/{id}?move_to={id}` | Delete a column (moves its tasks first) |

### GET /api/projects/{id}/task-columns

Returns the project's columns ordered by `position`. If the project has no columns, seeds default columns (e.g., "To Do", "In Progress", "Done") before returning.

### POST /api/projects/{id}/task-columns

Request body (`TaskColumnCreate`):

```json
{
  "name": "Blocked",
  "color": "#ef4444"
}
```

`color` defaults to `"#94a3b8"` (slate-400). Returns the created column at `201`.

### PATCH /api/task-columns/{id}

Partial update (`TaskColumnUpdate`). Fields: `name`, `color`, `position`.

### DELETE /api/task-columns/{id}

**Required** query parameter: `?move_to={column_id}`

Tasks in the deleted column are moved to the `move_to` column before deletion. Returns `204`. Returns `404` if either the column or the target column does not exist.

### TaskColumn Object Shape

```json
{
  "id": "tc_abc123",
  "projectId": "proj_abc123",
  "name": "In Progress",
  "color": "#3b82f6",
  "position": 1,
  "createdAt": "2024-03-15T10:00:00Z"
}
```

---

## Tasks

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/tasks` | List all tasks in a project |
| POST | `/api/projects/{id}/tasks` | Create a task |
| PATCH | `/api/tasks/{id}` | Update a task |
| DELETE | `/api/tasks/{id}` | Delete a task |

### GET /api/projects/{id}/tasks

Returns all tasks in the project across all columns, ordered by `position` within each column.

### POST /api/projects/{id}/tasks

Request body (`TaskCreate`):

```json
{
  "columnId": "tc_abc123",
  "title": "Run BM25 baseline experiments",
  "description": "Execute the baseline experiments with k=5, 10, 20.",
  "priority": "high",
  "dueDate": "2024-04-01",
  "tags": ["experiments", "baseline"],
  "customFields": {
    "tfd_effortId": "3 days",
    "tfd_assigneeId": "Dr. Researcher"
  }
}
```

Valid `priority` values: `high`, `medium`, `low`, `none`.

`customFields` is a map of `TaskFieldDef` IDs to values. Returns the created Task at `201`.

### PATCH /api/tasks/{id}

Partial update (`TaskUpdate`). Fields: `columnId`, `title`, `description`, `priority`, `dueDate`, `tags`, `customFields`, `position`.

Use `position` to reorder within a column (0-indexed).

### Task Object Shape

```json
{
  "id": "t_abc123",
  "projectId": "proj_abc123",
  "columnId": "tc_todo",
  "title": "Run BM25 baseline experiments",
  "description": "Execute the baseline experiments with k=5, 10, 20.",
  "priority": "high",
  "dueDate": "2024-04-01",
  "tags": ["experiments", "baseline"],
  "customFields": {
    "tfd_effortId": "3 days"
  },
  "position": 0,
  "createdAt": "2024-03-15T10:00:00Z",
  "updatedAt": "2024-03-15T10:00:00Z"
}
```

---

## Task Field Definitions

Custom fields that extend every task in a project. Values are stored in `tasks.custom_fields` as a JSONB map of field def ID to value.

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/task-field-defs` | List field definitions for a project |
| POST | `/api/projects/{id}/task-field-defs` | Create a field definition |
| PATCH | `/api/task-field-defs/{id}` | Update a field definition |
| DELETE | `/api/task-field-defs/{id}` | Delete a field definition |

### POST /api/projects/{id}/task-field-defs

Request body (`TaskFieldDefCreate`):

```json
{
  "name": "Effort",
  "fieldType": "select",
  "options": ["1 day", "3 days", "1 week", "2+ weeks"]
}
```

Valid `fieldType` values: `text`, `number`, `date`, `select`, `multi_select`.

`options` is only relevant for `select` and `multi_select` types.

Returns the created `TaskFieldDef` at `201`.

### PATCH /api/task-field-defs/{id}

Partial update (`TaskFieldDefUpdate`). Fields: `name`, `fieldType`, `options`, `position`.

### TaskFieldDef Object Shape

```json
{
  "id": "tfd_abc123",
  "projectId": "proj_abc123",
  "name": "Effort",
  "fieldType": "select",
  "options": ["1 day", "3 days", "1 week", "2+ weeks"],
  "position": 0,
  "createdAt": "2024-03-15T10:00:00Z"
}
```
