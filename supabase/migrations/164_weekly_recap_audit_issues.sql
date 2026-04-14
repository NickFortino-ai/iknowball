-- Persist any audit issues that remained in the recap after a retry attempt.
-- Empty array (or null) means the recap passed fact-checking cleanly.
-- Non-empty means at least one unsupported claim survived into the final
-- text — admins should review and edit before visible_after.
ALTER TABLE weekly_recaps
  ADD COLUMN IF NOT EXISTS audit_issues JSONB DEFAULT '[]'::jsonb;
