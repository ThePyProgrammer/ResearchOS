-- Add library_id to activity and runs for per-library filtering
ALTER TABLE activity ADD COLUMN IF NOT EXISTS library_id TEXT;
ALTER TABLE runs     ADD COLUMN IF NOT EXISTS library_id TEXT;
