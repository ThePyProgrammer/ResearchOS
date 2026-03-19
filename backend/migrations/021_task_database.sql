-- Migration 021: Task database — task_columns, tasks, task_field_defs
-- Run once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- task_columns: custom status columns per project (Kanban columns / statuses)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_columns (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#94a3b8',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_columns_project_id ON task_columns (project_id);

ALTER TABLE task_columns DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- tasks: project tasks with default + custom fields
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    column_id     TEXT NOT NULL REFERENCES task_columns(id) ON DELETE RESTRICT,
    title         TEXT NOT NULL,
    description   TEXT,
    priority      TEXT NOT NULL DEFAULT 'none',
    due_date      TEXT,
    tags          JSONB NOT NULL DEFAULT '[]',
    custom_fields JSONB NOT NULL DEFAULT '{}',
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id  ON tasks (column_id);

ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- task_field_defs: custom field definitions per project
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_field_defs (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    field_type  TEXT NOT NULL,
    options     JSONB NOT NULL DEFAULT '[]',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_field_defs_project_id ON task_field_defs (project_id);

ALTER TABLE task_field_defs DISABLE ROW LEVEL SECURITY;
