-- Per-user persistence for the Leaderboard page tab order so a user's
-- chosen ordering follows them across devices (desktop ↔ mobile) instead
-- of living only in localStorage. Stored as an ordered JSONB array of
-- tab labels — the client matches each label back to the DEFAULT_TABS
-- definition and appends any new tabs that didn't exist when the user
-- last reordered.

ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_tab_order JSONB;
