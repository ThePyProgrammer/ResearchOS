-- Additional author profile links. Existing author records remain valid.
ALTER TABLE authors
    ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
    ADD COLUMN IF NOT EXISTS twitter_url TEXT;
