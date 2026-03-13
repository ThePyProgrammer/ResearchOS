-- Add is_pinned flag to notes so users can keep important notes at the top of
-- the file tree.  Existing rows default to FALSE (unpinned).

ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
