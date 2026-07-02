-- Playoff roster-move lock for eliminated fantasy teams.
--
-- Sets when the team can no longer transact (add/drop/trade/waiver):
--   - Non-playoff qualifiers: at end of regular season
--   - Playoff losers with no downstream bracket slot: at end of losing week
--
-- A team stays alive as long as they have any upcoming playoff matchup —
-- consolation counts. Once they're eliminated, roster is frozen for the
-- rest of the league. Enforced server-side by addDropPlayer, trade, and
-- waiver claim handlers.

ALTER TABLE league_members
  ADD COLUMN IF NOT EXISTS fantasy_eliminated_at TIMESTAMPTZ;

-- Fast lookup for the transaction guards ("is this member eliminated?")
CREATE INDEX IF NOT EXISTS idx_league_members_fantasy_eliminated
  ON league_members (league_id, fantasy_eliminated_at)
  WHERE fantasy_eliminated_at IS NOT NULL;
