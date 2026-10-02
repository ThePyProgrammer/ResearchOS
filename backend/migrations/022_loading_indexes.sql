-- Apply through the Supabase SQL editor. No API/schema changes are required.
-- Library-scoped reads and chronological lists.
CREATE INDEX IF NOT EXISTS idx_papers_library_published ON papers (library_id, published_date);
CREATE INDEX IF NOT EXISTS idx_websites_library ON websites (library_id);
CREATE INDEX IF NOT EXISTS idx_collections_library ON collections (library_id);
CREATE INDEX IF NOT EXISTS idx_github_repos_library_published ON github_repos (library_id, published_date);

-- The collections fields are JSONB arrays; these support containment filters.
CREATE INDEX IF NOT EXISTS idx_papers_collections_gin ON papers USING gin (collections jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_websites_collections_gin ON websites USING gin (collections jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_github_repos_collections_gin ON github_repos USING gin (collections jsonb_path_ops);
