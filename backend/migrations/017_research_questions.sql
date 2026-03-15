-- Migration 017: Research questions and project-paper linking
-- Run once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- research_questions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_questions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES research_questions(id) ON DELETE CASCADE,
    question    TEXT NOT NULL,
    hypothesis  TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rqs_project_id ON research_questions (project_id);
CREATE INDEX IF NOT EXISTS idx_rqs_parent_id  ON research_questions (parent_id);

ALTER TABLE research_questions DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- project_papers: links papers or websites to a project
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_papers (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    paper_id    TEXT REFERENCES papers(id) ON DELETE CASCADE,
    website_id  TEXT REFERENCES websites(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    -- exactly one of paper_id / website_id must be set
    CONSTRAINT project_papers_source_check CHECK (
        (paper_id IS NOT NULL)::int + (website_id IS NOT NULL)::int = 1
    )
);

-- Prevent duplicate links per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_papers_paper
    ON project_papers (project_id, paper_id) WHERE paper_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_papers_website
    ON project_papers (project_id, website_id) WHERE website_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_papers_project_id ON project_papers (project_id);

ALTER TABLE project_papers DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- rq_papers: links papers or websites to a research question
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rq_papers (
    id          TEXT PRIMARY KEY,
    rq_id       TEXT NOT NULL REFERENCES research_questions(id) ON DELETE CASCADE,
    paper_id    TEXT REFERENCES papers(id) ON DELETE CASCADE,
    website_id  TEXT REFERENCES websites(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    -- exactly one of paper_id / website_id must be set
    CONSTRAINT rq_papers_source_check CHECK (
        (paper_id IS NOT NULL)::int + (website_id IS NOT NULL)::int = 1
    )
);

CREATE INDEX IF NOT EXISTS idx_rq_papers_rq_id ON rq_papers (rq_id);

ALTER TABLE rq_papers DISABLE ROW LEVEL SECURITY;
