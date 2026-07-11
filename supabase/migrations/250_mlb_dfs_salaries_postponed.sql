-- MLB DFS / HR Derby / Strikeouts: allow swap-out of players from
-- pre-start postponed games.
--
-- Time-based lock (game_starts_at <= now) doesn't know a game got called
-- off before first pitch — rain-outs / weather delays that never resume
-- would keep users locked to a player who literally didn't play. Adding
-- a discriminator column so the save endpoints and client can unlock
-- these specific rows.
--
-- Flagged only for PRE-start postponements. Mid-game postponements
-- (live → postponed) don't set this flag, so a player who banked partial
-- innings before the tarp came out stays locked (matches Nick's ruling
-- 2026-07-10 — users eat the mid-game case).
--
-- Set by syncLiveScores when transitioning games.status upcoming →
-- postponed. Never backfilled for historical postponements.

ALTER TABLE mlb_dfs_salaries
  ADD COLUMN IF NOT EXISTS is_postponed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mlb_dfs_salaries_postponed
  ON mlb_dfs_salaries(game_date, is_postponed)
  WHERE is_postponed = true;
