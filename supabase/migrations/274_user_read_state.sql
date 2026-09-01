-- Per-USER read state, replacing three separate per-DEVICE localStorage
-- keys. Reading a player update on your phone left the orange dot still
-- showing on your laptop, because the only record of it lived in that
-- phone's localStorage.
--
-- One table for all three rather than three tables, because they're the
-- same shape — "user U has seen version V of thing T":
--
--   kind='blurb'           ref_id=player_id   value=blurb_id (uuid)
--   kind='league_note'     ref_id=league_id   value=ISO timestamp
--   kind='matchup_result'  ref_id=matchup_id  value='1'
--
-- value is TEXT so each kind stores whatever it needs to detect "this
-- changed since you saw it". ref_id is TEXT because player ids are text
-- (Sleeper ids) while league/matchup ids are uuids.
--
-- Row per (user, kind, ref) with an upsert rather than one JSON blob per
-- user: two devices marking different things read at the same time would
-- clobber each other under a read-modify-write on a blob.

CREATE TABLE IF NOT EXISTS user_read_state (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref_id)
);

-- The only read pattern is "everything for this user", loaded once per
-- session and cached client-side.
CREATE INDEX IF NOT EXISTS idx_user_read_state_user
  ON user_read_state(user_id);

-- Matches every other table here: server holds the service-role key and
-- all access goes through Express, so RLS on with no policies is the
-- correct closed default.
ALTER TABLE user_read_state ENABLE ROW LEVEL SECURITY;
