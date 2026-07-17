-- User-supplied names for saved draft-prep rankings. One row per
-- (user, roster_config, scoring_format). Separate from
-- draft_prep_rankings because that table has one row per player per
-- config (many rows) — the name is metadata about the config, not
-- about each player row.
CREATE TABLE IF NOT EXISTS draft_prep_ranking_names (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roster_config_hash TEXT NOT NULL,
  scoring_format TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) <= 50 AND length(name) > 0),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, roster_config_hash, scoring_format)
);

-- Data API grants (per project convention — new tables need explicit
-- grants for the PostgREST-fronted client).
GRANT SELECT, INSERT, UPDATE, DELETE ON draft_prep_ranking_names TO anon, authenticated;
