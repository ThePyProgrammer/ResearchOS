-- Add library_id to chat_messages so Notes Copilot history persists per library.
-- Without this column the copilot still works but conversation history is not
-- saved to the database and is lost on page reload.
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS library_id TEXT
  REFERENCES libraries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_library_id
  ON chat_messages (library_id);
