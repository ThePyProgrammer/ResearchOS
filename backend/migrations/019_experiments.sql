-- Migration 019: Experiments table and experiment-paper linking
-- Run once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- experiments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS experiments (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES experiments(id) ON DELETE CASCADE,
    rq_id       TEXT REFERENCES research_questions(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'planned',
    config      JSONB NOT NULL DEFAULT '{}',
    metrics     JSONB NOT NULL DEFAULT '{}',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_experiments_project_id ON experiments (project_id);
CREATE INDEX IF NOT EXISTS idx_experiments_parent_id  ON experiments (parent_id);
CREATE INDEX IF NOT EXISTS idx_experiments_rq_id      ON experiments (rq_id);

ALTER TABLE experiments DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- experiment_papers: links papers, websites, or github repos to an experiment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS experiment_papers (
    id               TEXT PRIMARY KEY,
    experiment_id    TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    paper_id         TEXT REFERENCES papers(id) ON DELETE CASCADE,
    website_id       TEXT REFERENCES websites(id) ON DELETE CASCADE,
    github_repo_id   TEXT REFERENCES github_repos(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL,
    -- exactly one of paper_id / website_id / github_repo_id must be set
    CONSTRAINT experiment_papers_source_check CHECK (
        (paper_id IS NOT NULL)::int +
        (website_id IS NOT NULL)::int +
        (github_repo_id IS NOT NULL)::int = 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_papers_paper
    ON experiment_papers (experiment_id, paper_id) WHERE paper_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_papers_website
    ON experiment_papers (experiment_id, website_id) WHERE website_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_papers_github
    ON experiment_papers (experiment_id, github_repo_id) WHERE github_repo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_experiment_papers_experiment_id ON experiment_papers (experiment_id);

ALTER TABLE experiment_papers DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Add experiment_id FK to notes
-- ---------------------------------------------------------------------------
ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS experiment_id TEXT REFERENCES experiments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notes_experiment_id ON notes (experiment_id);
