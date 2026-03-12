-- Support notes and chat for GitHub repos alongside papers and websites
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS github_repo_id TEXT;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS github_repo_id TEXT;
