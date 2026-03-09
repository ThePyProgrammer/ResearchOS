-- authors table
CREATE TABLE IF NOT EXISTS authors (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    orcid           TEXT,
    google_scholar_url TEXT,
    github_username TEXT,
    openreview_url  TEXT,
    website_url     TEXT,
    emails          JSONB NOT NULL DEFAULT '[]',
    affiliations    JSONB NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL
);
CREATE INDEX idx_authors_name_normalized ON authors (name_normalized);
CREATE UNIQUE INDEX idx_authors_orcid ON authors (orcid) WHERE orcid IS NOT NULL;

-- paper_authors join table
CREATE TABLE IF NOT EXISTS paper_authors (
    id         TEXT PRIMARY KEY,
    paper_id   TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    author_id  TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL DEFAULT 0,
    raw_name   TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (paper_id, author_id)
);
CREATE INDEX idx_paper_authors_paper ON paper_authors (paper_id);
CREATE INDEX idx_paper_authors_author ON paper_authors (author_id);

ALTER TABLE authors DISABLE ROW LEVEL SECURITY;
ALTER TABLE paper_authors DISABLE ROW LEVEL SECURITY;
