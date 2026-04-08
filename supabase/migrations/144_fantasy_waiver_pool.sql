-- Per-league waiver pool. A player sits in this table from the moment they
-- are dropped (or otherwise placed on waivers) until the next waiver run
-- clears them back to the free-agent pool. While a player is in this table
-- they can ONLY be acquired via a waiver claim, not as a free-agent add.
CREATE TABLE IF NOT EXISTS fantasy_waiver_pool (
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  on_waivers_since TIMESTAMPTZ NOT NULL DEFAULT now(),
  clears_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL DEFAULT 'dropped',
  PRIMARY KEY (league_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_waiver_pool_clears
  ON fantasy_waiver_pool(league_id, clears_at);

ALTER TABLE fantasy_waiver_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read waiver pool" ON fantasy_waiver_pool;
CREATE POLICY "Members read waiver pool" ON fantasy_waiver_pool FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM league_members
    WHERE league_members.league_id = fantasy_waiver_pool.league_id
      AND league_members.user_id = auth.uid()
  ));
