-- Support notes for websites alongside papers
ALTER TABLE notes
  ALTER COLUMN paper_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS website_id TEXT;
