-- Add published_date to papers (full date, like websites have)
-- year column kept for backward compatibility; frontend derives year from published_date when set.
ALTER TABLE papers ADD COLUMN IF NOT EXISTS published_date TEXT;
