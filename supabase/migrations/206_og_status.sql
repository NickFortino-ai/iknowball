-- OG status — earliest active users who helped Nick build IKB. Surfaced
-- on the user profile modal as a badge, and listed under Royalty in the
-- Hall of Fame. Flipping this flag is a manual admin curation step.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_og BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_is_og ON users(is_og) WHERE is_og = TRUE;
