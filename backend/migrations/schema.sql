-- =============================================================================
-- ResearchOS — full schema (merged)
-- =============================================================================
-- This single file replaces running migrations 001–010 individually.
-- New users: paste this into the Supabase SQL Editor and run it once.
--
-- All statements use IF NOT EXISTS / IF NOT EXISTS so the script is safe to
-- re-run against a database that already has some tables.
-- =============================================================================


-- =============================================================================
-- LIBRARIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS libraries (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    description        TEXT,
    auto_note_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    auto_note_prompt   TEXT,
    created_at         TEXT NOT NULL
);

ALTER TABLE libraries DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- PAPERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS papers (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    authors          JSONB NOT NULL DEFAULT '[]',
    year             INTEGER NOT NULL,
    published_date   TEXT,                         -- full ISO date; year kept for back-compat
    venue            TEXT NOT NULL DEFAULT '',
    doi              TEXT,
    arxiv_id         TEXT,
    status           TEXT NOT NULL DEFAULT 'inbox',
    tags             JSONB NOT NULL DEFAULT '[]',
    abstract         TEXT,
    source           TEXT NOT NULL DEFAULT 'human',
    agent_run        JSONB,
    relevance_score  INTEGER,
    agent_reasoning  TEXT,
    rejected         BOOLEAN NOT NULL DEFAULT FALSE,
    collections      JSONB NOT NULL DEFAULT '[]',
    pdf_url          TEXT,
    github_url       TEXT,
    website_url      TEXT,
    links            JSONB NOT NULL DEFAULT '[]',
    library_id       TEXT,
    created_at       TEXT NOT NULL,
    item_type        TEXT NOT NULL DEFAULT 'paper'
);

ALTER TABLE papers DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- WEBSITES
-- =============================================================================

CREATE TABLE IF NOT EXISTS websites (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    authors         JSONB NOT NULL DEFAULT '[]',
    published_date  TEXT,
    description     TEXT,
    tags            JSONB NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'inbox',
    source          TEXT NOT NULL DEFAULT 'human',
    github_url      TEXT,
    links           JSONB NOT NULL DEFAULT '[]',
    collections     JSONB NOT NULL DEFAULT '[]',
    library_id      TEXT,
    created_at      TEXT NOT NULL,
    item_type       TEXT NOT NULL DEFAULT 'website'
);

ALTER TABLE websites DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- GITHUB REPOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS github_repos (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    owner           TEXT NOT NULL,
    repo_name       TEXT NOT NULL,
    description     TEXT,
    abstract        TEXT,
    stars           INTEGER,
    language        TEXT,
    topics          JSONB NOT NULL DEFAULT '[]',
    authors         JSONB NOT NULL DEFAULT '[]',
    published_date  TEXT,
    version         TEXT,
    doi             TEXT,
    license         TEXT,
    website_url     TEXT,
    links           JSONB NOT NULL DEFAULT '[]',
    tags            JSONB NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'inbox',
    source          TEXT NOT NULL DEFAULT 'human',
    collections     JSONB NOT NULL DEFAULT '[]',
    library_id      TEXT,
    created_at      TEXT NOT NULL,
    item_type       TEXT NOT NULL DEFAULT 'github_repo'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repos_url       ON github_repos (url);
CREATE        INDEX IF NOT EXISTS idx_github_repos_library   ON github_repos (library_id);
CREATE        INDEX IF NOT EXISTS idx_github_repos_status    ON github_repos (status);
CREATE        INDEX IF NOT EXISTS idx_github_repos_published ON github_repos (published_date);

ALTER TABLE github_repos DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- COLLECTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS collections (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    parent_id  TEXT,
    type       TEXT NOT NULL DEFAULT 'folder',
    library_id TEXT
);

ALTER TABLE collections DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- AUTHORS
-- =============================================================================

CREATE TABLE IF NOT EXISTS authors (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    name_normalized     TEXT NOT NULL,
    orcid               TEXT,
    google_scholar_url  TEXT,
    github_username     TEXT,
    openreview_url      TEXT,
    website_url         TEXT,
    emails              JSONB NOT NULL DEFAULT '[]',
    affiliations        JSONB NOT NULL DEFAULT '[]',
    created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authors_name_normalized ON authors (name_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS idx_authors_orcid ON authors (orcid) WHERE orcid IS NOT NULL;

ALTER TABLE authors DISABLE ROW LEVEL SECURITY;


-- Paper ↔ author join table
CREATE TABLE IF NOT EXISTS paper_authors (
    id         TEXT PRIMARY KEY,
    paper_id   TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    author_id  TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL DEFAULT 0,
    raw_name   TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (paper_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_paper_authors_paper  ON paper_authors (paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_authors_author ON paper_authors (author_id);

ALTER TABLE paper_authors DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- WORKFLOWS
-- =============================================================================

CREATE TABLE IF NOT EXISTS workflows (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    icon             TEXT NOT NULL DEFAULT '',
    icon_color       TEXT NOT NULL DEFAULT '',
    icon_bg          TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'stable',
    steps            JSONB NOT NULL DEFAULT '[]',
    tools            JSONB NOT NULL DEFAULT '[]',
    tool_colors      JSONB NOT NULL DEFAULT '[]',
    estimated_time   TEXT NOT NULL DEFAULT '',
    can_run_directly BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE workflows DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- RUNS
-- =============================================================================

CREATE TABLE IF NOT EXISTS runs (
    id                   TEXT PRIMARY KEY,
    workflow_id          TEXT,
    workflow_name        TEXT NOT NULL DEFAULT '',
    prompt               TEXT,
    target_collection    TEXT,
    target_collection_id TEXT,
    constraints          JSONB,
    started_at           TEXT NOT NULL,
    started_by           TEXT NOT NULL DEFAULT '',
    duration             TEXT,
    status               TEXT NOT NULL DEFAULT 'running',
    progress             INTEGER,
    current_step         TEXT,
    logs                 JSONB,
    cost                 JSONB,
    trace                JSONB,
    library_id           TEXT
);

ALTER TABLE runs DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- PROPOSALS
-- =============================================================================

CREATE TABLE IF NOT EXISTS proposals (
    id       TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    run_id   TEXT NOT NULL REFERENCES runs(id)   ON DELETE CASCADE,
    status   TEXT NOT NULL DEFAULT 'pending',
    checked  BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE proposals DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- ACTIVITY
-- =============================================================================

CREATE TABLE IF NOT EXISTS activity (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    icon         TEXT NOT NULL DEFAULT '',
    icon_color   TEXT NOT NULL DEFAULT '',
    icon_bg      TEXT NOT NULL DEFAULT '',
    title        TEXT NOT NULL,
    detail       TEXT,
    badges       JSONB,
    time         TEXT NOT NULL,
    running      BOOLEAN,
    progress     INTEGER,
    current_step TEXT,
    action       JSONB,
    library_id   TEXT
);

ALTER TABLE activity DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- NOTES  (per-paper and per-website file tree)
-- =============================================================================

CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    paper_id   TEXT,                               -- NULL for website notes
    website_id TEXT,                               -- NULL for paper notes
    name       TEXT NOT NULL,
    parent_id  TEXT,
    type       TEXT NOT NULL DEFAULT 'file',       -- file | folder
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

ALTER TABLE notes DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- CHAT MESSAGES  (copilot history per paper and per website)
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    paper_id    TEXT,                              -- NULL for website chat
    website_id  TEXT,                              -- NULL for paper chat
    role        TEXT NOT NULL DEFAULT 'user',
    content     TEXT NOT NULL DEFAULT '',
    suggestions JSONB,
    created_at  TEXT NOT NULL
);

ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- PAPER TEXTS  (cached PDF text extraction)
-- =============================================================================

CREATE TABLE IF NOT EXISTS paper_texts (
    paper_id     TEXT PRIMARY KEY,
    markdown     TEXT NOT NULL DEFAULT '',
    page_count   INTEGER NOT NULL DEFAULT 0,
    extracted_at TEXT NOT NULL
);

ALTER TABLE paper_texts DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- STORAGE: pdfs bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdfs', 'pdfs', true, 52428800, '{application/pdf}')
ON CONFLICT (id) DO NOTHING;

-- Allow unauthenticated reads and backend writes on the pdfs bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'pdfs public read'
    ) THEN
        CREATE POLICY "pdfs public read"
            ON storage.objects FOR SELECT
            TO public
            USING (bucket_id = 'pdfs');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'pdfs backend write'
    ) THEN
        CREATE POLICY "pdfs backend write"
            ON storage.objects FOR INSERT
            TO public
            WITH CHECK (bucket_id = 'pdfs');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'pdfs backend delete'
    ) THEN
        CREATE POLICY "pdfs backend delete"
            ON storage.objects FOR DELETE
            TO public
            USING (bucket_id = 'pdfs');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'pdfs backend update'
    ) THEN
        CREATE POLICY "pdfs backend update"
            ON storage.objects FOR UPDATE
            TO public
            USING (bucket_id = 'pdfs')
            WITH CHECK (bucket_id = 'pdfs');
    END IF;
END
$$;
