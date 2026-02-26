-- League-specific picks for pick'em leagues
CREATE TABLE league_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  league_week_id UUID NOT NULL REFERENCES league_weeks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  picked_team TEXT NOT NULL CHECK (picked_team IN ('home', 'away')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'settled')),
  odds_at_pick INTEGER,
  risk_points INTEGER,
  reward_points INTEGER,
  odds_at_submission INTEGER,
  risk_at_submission INTEGER,
  reward_at_submission INTEGER,
  is_correct BOOLEAN,
  points_earned INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, game_id)
);

CREATE INDEX idx_league_picks_game ON league_picks(game_id);
CREATE INDEX idx_league_picks_league_user ON league_picks(league_id, user_id);
CREATE INDEX idx_league_picks_status ON league_picks(status);

-- Flag to distinguish new league-pick leagues from legacy ones
ALTER TABLE leagues ADD COLUMN use_league_picks BOOLEAN DEFAULT false;
