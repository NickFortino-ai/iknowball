-- Manual overrides for player display names when ESPN's data is wrong or
-- inconsistent. Keyed by (sport_key, espn_player_id) — espn_player_id is
-- stable across ESPN's data changes, so this survives roster shuffles.
-- Applied at pool-build time in the relevant service (e.g.
-- wnbaThreePointService.fetchTeamRoster).

CREATE TABLE IF NOT EXISTS player_name_overrides (
  sport_key TEXT NOT NULL,
  espn_player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (sport_key, espn_player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_name_overrides_sport
  ON player_name_overrides(sport_key);
