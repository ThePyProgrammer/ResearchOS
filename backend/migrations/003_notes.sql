-- Notes: per-paper filesystem for markdown notes
CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    paper_id   TEXT NOT NULL,
    name       TEXT NOT NULL,
    parent_id  TEXT,
    type       TEXT NOT NULL DEFAULT 'file',   -- file | folder
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
