CREATE TABLE IF NOT EXISTS bonus_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id UUID REFERENCES leagues(id) ON DELETE SET NULL,
  type TEXT NOT NULL,           -- 'survivor_win', 'league_win'
  label TEXT NOT NULL,          -- display text for pick history
  points INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_points_user_id ON bonus_points(user_id);
