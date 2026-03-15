-- Migration 015: Create projects table
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT,
    status      TEXT        NOT NULL DEFAULT 'active',
    library_id  TEXT        NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    created_at  TEXT        NOT NULL,
    updated_at  TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_library_id ON projects (library_id);
