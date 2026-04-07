-- Allow commissioners to pause an in-progress draft.
ALTER TABLE fantasy_settings DROP CONSTRAINT IF EXISTS fantasy_settings_draft_status_check;
ALTER TABLE fantasy_settings ADD CONSTRAINT fantasy_settings_draft_status_check
  CHECK (draft_status IN ('pending', 'in_progress', 'paused', 'completed'));

ALTER TABLE fantasy_settings
  ADD COLUMN IF NOT EXISTS draft_resumed_at TIMESTAMPTZ;
