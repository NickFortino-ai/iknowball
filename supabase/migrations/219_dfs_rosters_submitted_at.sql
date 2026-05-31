-- NFL salary cap: explicit "Submit Roster" state.
-- Auto-save still runs on every pick (so users never lose work), but the
-- Submit button gives users the conventional DFS "I commit to this lineup"
-- confirmation. Any subsequent edit clears submitted_at so the badge resets.

ALTER TABLE dfs_rosters
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL;
