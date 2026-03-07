-- Add AI auto-note settings to libraries
ALTER TABLE libraries
  ADD COLUMN IF NOT EXISTS auto_note_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_note_prompt  TEXT;
