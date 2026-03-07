CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
