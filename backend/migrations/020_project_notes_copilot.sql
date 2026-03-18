-- Migration 020: Add project_id to chat_messages for project-scoped copilot history
-- Run in Supabase SQL editor

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS project_id text
  REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id
  ON chat_messages (project_id);
