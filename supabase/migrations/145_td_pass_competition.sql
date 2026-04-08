-- Touchdown Pass Competition: simple season-long league where each user
-- picks one QB per NFL week, can never re-pick the same QB, and the
-- standings are total accumulated passing TDs across all picks.

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_format_check
  CHECK (format IN ('pickem', 'survivor', 'squares', 'bracket', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'td_pass'));

CREATE TABLE IF NOT EXISTS td_pass_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  qb_player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  qb_name TEXT NOT NULL,
  team TEXT,
  headshot_url TEXT,
  td_count INTEGER NOT NULL DEFAULT 0,
  scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- One pick per user per league per week
  UNIQUE(league_id, user_id, week),
  -- A user can never re-pick the same QB in the same league across the season
  UNIQUE(league_id, user_id, qb_player_id)
);

CREATE INDEX IF NOT EXISTS idx_td_pass_picks_league ON td_pass_picks(league_id, week);
CREATE INDEX IF NOT EXISTS idx_td_pass_picks_user ON td_pass_picks(league_id, user_id);

ALTER TABLE td_pass_picks ENABLE ROW LEVEL SECURITY;

-- All league members can read every pick (history is public to the league)
DROP POLICY IF EXISTS "Members read td_pass picks" ON td_pass_picks;
CREATE POLICY "Members read td_pass picks" ON td_pass_picks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM league_members
    WHERE league_members.league_id = td_pass_picks.league_id
      AND league_members.user_id = auth.uid()
  ));

-- Members can only insert/update/delete their own picks
DROP POLICY IF EXISTS "Members write own td_pass picks" ON td_pass_picks;
CREATE POLICY "Members write own td_pass picks" ON td_pass_picks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
