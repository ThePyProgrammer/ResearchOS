-- Add library_id to notes so notes can belong directly to a library
-- (not tied to a specific paper, website, or GitHub repo).
-- Used by the Library Notes IDE (/library/notes).
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS library_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_library ON notes (library_id);
