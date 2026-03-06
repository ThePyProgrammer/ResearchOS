-- Add GitHub and website URL fields to papers
ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS github_url  TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT;
