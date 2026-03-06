-- ResearchOS — initial schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS papers (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    authors      JSONB NOT NULL DEFAULT '[]',
    year         INTEGER NOT NULL,
    venue        TEXT NOT NULL DEFAULT '',
    doi          TEXT,
    arxiv_id     TEXT,
    status       TEXT NOT NULL DEFAULT 'inbox',
    tags         JSONB NOT NULL DEFAULT '[]',
    abstract     TEXT,
    source       TEXT NOT NULL DEFAULT 'human',
    agent_run    JSONB,
    relevance_score  INTEGER,
    agent_reasoning  TEXT,
    rejected     BOOLEAN NOT NULL DEFAULT FALSE,
    collections  JSONB NOT NULL DEFAULT '[]',
    pdf_url      TEXT,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    parent_id TEXT,
    type      TEXT NOT NULL DEFAULT 'folder'
);

CREATE TABLE IF NOT EXISTS workflows (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    icon            TEXT NOT NULL DEFAULT '',
    icon_color      TEXT NOT NULL DEFAULT '',
    icon_bg         TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'stable',
    steps           JSONB NOT NULL DEFAULT '[]',
    tools           JSONB NOT NULL DEFAULT '[]',
    tool_colors     JSONB NOT NULL DEFAULT '[]',
    estimated_time  TEXT NOT NULL DEFAULT '',
    can_run_directly BOOLEAN NOT NULL DEFAULT FALSE
);

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
    trace                JSONB
);

CREATE TABLE IF NOT EXISTS proposals (
    id       TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    run_id   TEXT NOT NULL REFERENCES runs(id)   ON DELETE CASCADE,
    status   TEXT NOT NULL DEFAULT 'pending',
    checked  BOOLEAN NOT NULL DEFAULT TRUE
);

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
    action       JSONB
);

-- ============================================================
-- Disable RLS so the publishable (anon) key works from backend
-- ============================================================

ALTER TABLE papers     DISABLE ROW LEVEL SECURITY;
ALTER TABLE collections DISABLE ROW LEVEL SECURITY;
ALTER TABLE workflows  DISABLE ROW LEVEL SECURITY;
ALTER TABLE runs       DISABLE ROW LEVEL SECURITY;
ALTER TABLE proposals  DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity   DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Storage: pdfs bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdfs', 'pdfs', true, 52428800, '{application/pdf}')
ON CONFLICT (id) DO NOTHING;

-- Allow unauthenticated reads and backend writes on the pdfs bucket
CREATE POLICY "pdfs public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'pdfs');

CREATE POLICY "pdfs backend write"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'pdfs');

CREATE POLICY "pdfs backend delete"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'pdfs');

CREATE POLICY "pdfs backend update"
  ON storage.objects FOR UPDATE
  TO public
  USING (bucket_id = 'pdfs')
  WITH CHECK (bucket_id = 'pdfs');
