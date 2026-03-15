-- Migration 018: Add github_repo_id to project_papers and rq_papers
-- Run once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- project_papers: add github_repo_id column
-- ---------------------------------------------------------------------------
ALTER TABLE project_papers
    ADD COLUMN IF NOT EXISTS github_repo_id TEXT REFERENCES github_repos(id) ON DELETE CASCADE;

-- Drop old constraint and recreate with three-way check
ALTER TABLE project_papers DROP CONSTRAINT IF EXISTS project_papers_source_check;
ALTER TABLE project_papers ADD CONSTRAINT project_papers_source_check CHECK (
    (paper_id IS NOT NULL)::int + (website_id IS NOT NULL)::int + (github_repo_id IS NOT NULL)::int = 1
);

-- Prevent duplicate github repo links per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_papers_github_repo
    ON project_papers (project_id, github_repo_id) WHERE github_repo_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- rq_papers: add github_repo_id column
-- ---------------------------------------------------------------------------
ALTER TABLE rq_papers
    ADD COLUMN IF NOT EXISTS github_repo_id TEXT REFERENCES github_repos(id) ON DELETE CASCADE;

-- Drop old constraint and recreate with three-way check
ALTER TABLE rq_papers DROP CONSTRAINT IF EXISTS rq_papers_source_check;
ALTER TABLE rq_papers ADD CONSTRAINT rq_papers_source_check CHECK (
    (paper_id IS NOT NULL)::int + (website_id IS NOT NULL)::int + (github_repo_id IS NOT NULL)::int = 1
);
