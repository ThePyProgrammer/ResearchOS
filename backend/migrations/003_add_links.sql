-- Add named links (array of {name, url} objects) to papers and websites
ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]';

ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]';
