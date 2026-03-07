CREATE TABLE IF NOT EXISTS paper_texts (
    paper_id TEXT PRIMARY KEY,
    markdown TEXT NOT NULL DEFAULT '',
    page_count INTEGER NOT NULL DEFAULT 0,
    extracted_at TEXT NOT NULL
);

ALTER TABLE paper_texts DISABLE ROW LEVEL SECURITY;
