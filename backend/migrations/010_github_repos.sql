-- GitHub repositories table
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS github_repos (
    id             TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    url            TEXT NOT NULL,
    owner          TEXT NOT NULL,
    repo_name      TEXT NOT NULL,
    description    TEXT,
    abstract       TEXT,
    stars          INTEGER,
    language       TEXT,
    topics         JSONB NOT NULL DEFAULT '[]',
    authors        JSONB NOT NULL DEFAULT '[]',
    published_date TEXT,
    version        TEXT,
    doi            TEXT,
    license        TEXT,
    tags           JSONB NOT NULL DEFAULT '[]',
    status         TEXT NOT NULL DEFAULT 'inbox',
    source         TEXT NOT NULL DEFAULT 'human',
    collections    JSONB NOT NULL DEFAULT '[]',
    library_id     TEXT,
    created_at     TEXT NOT NULL,
    item_type      TEXT NOT NULL DEFAULT 'github_repo'
);

-- Fast lookups for dedup (by canonical URL) and library scoping
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repos_url       ON github_repos (url);
CREATE        INDEX IF NOT EXISTS idx_github_repos_library   ON github_repos (library_id);
CREATE        INDEX IF NOT EXISTS idx_github_repos_status    ON github_repos (status);
CREATE        INDEX IF NOT EXISTS idx_github_repos_published ON github_repos (published_date);

ALTER TABLE github_repos DISABLE ROW LEVEL SECURITY;
