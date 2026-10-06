-- Optional indexes for batched notes reads. Apply in the Supabase SQL editor.
CREATE INDEX IF NOT EXISTS idx_notes_paper_id ON notes (paper_id);
CREATE INDEX IF NOT EXISTS idx_notes_website_id ON notes (website_id);
CREATE INDEX IF NOT EXISTS idx_notes_github_repo_id ON notes (github_repo_id);
