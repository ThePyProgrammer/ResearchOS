-- Migration 016: Add project_id column to notes table
-- Run once in the Supabase SQL editor (after 015_projects.sql).

ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes (project_id);
