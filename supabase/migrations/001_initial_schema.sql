-- ============================================
-- I Know Ball - Initial Schema Migration
-- ============================================

-- Sports table
CREATE TABLE IF NOT EXISTS sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  total_points INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'Rookie',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  sport_id UUID NOT NULL REFERENCES sports(id),
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'final')),
  home_odds INTEGER,
  away_odds INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  winner TEXT CHECK (winner IN ('home', 'away', NULL)),
  season TEXT,
  week TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Picks table
CREATE TABLE IF NOT EXISTS picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  picked_team TEXT NOT NULL CHECK (picked_team IN ('home', 'away')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'settled')),
  odds_at_pick INTEGER,
  risk_points INTEGER,
  reward_points INTEGER,
  is_correct BOOLEAN,
  points_earned INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, game_id)
);

-- User sport stats table
CREATE TABLE IF NOT EXISTS user_sport_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES sports(id),
  total_picks INTEGER DEFAULT 0,
  correct_picks INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, sport_id)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_games_sport_id ON games(sport_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_starts_at ON games(starts_at);
CREATE INDEX idx_games_external_id ON games(external_id);

CREATE INDEX idx_picks_user_id ON picks(user_id);
CREATE INDEX idx_picks_game_id ON picks(game_id);
CREATE INDEX idx_picks_status ON picks(status);
CREATE INDEX idx_picks_user_game ON picks(user_id, game_id);

CREATE INDEX idx_user_sport_stats_user ON user_sport_stats(user_id);
CREATE INDEX idx_user_sport_stats_sport ON user_sport_stats(sport_id);

CREATE INDEX idx_users_total_points ON users(total_points DESC);
CREATE INDEX idx_users_tier ON users(tier);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sport_stats ENABLE ROW LEVEL SECURITY;

-- Sports: readable by all authenticated users
CREATE POLICY "Sports are viewable by authenticated users"
  ON sports FOR SELECT
  TO authenticated
  USING (true);

-- Users: readable by all, writable by owner
CREATE POLICY "Users are viewable by authenticated users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Games: readable by all authenticated users
CREATE POLICY "Games are viewable by authenticated users"
  ON games FOR SELECT
  TO authenticated
  USING (true);

-- Picks: readable by owner, writable by owner
CREATE POLICY "Users can view own picks"
  ON picks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own picks"
  ON picks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own picks"
  ON picks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- User sport stats: readable by all, writable by system (via service role)
CREATE POLICY "Sport stats are viewable by authenticated users"
  ON user_sport_stats FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- Seed Data
-- ============================================
INSERT INTO sports (key, name, active) VALUES
  ('americanfootball_nfl', 'NFL', true)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- SQL Functions for Atomic Updates (used by scoring engine)
-- ============================================

-- Increment user total points atomically
CREATE OR REPLACE FUNCTION increment_user_points(user_row_id UUID, points_delta INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET total_points = total_points + points_delta,
      tier = CASE
        WHEN total_points + points_delta >= 10000 THEN 'GOAT'
        WHEN total_points + points_delta >= 2000 THEN 'MVP'
        WHEN total_points + points_delta >= 500 THEN 'All-Star'
        WHEN total_points + points_delta >= 100 THEN 'Starter'
        ELSE 'Rookie'
      END,
      updated_at = now()
  WHERE id = user_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update sport stats atomically (handles streaks)
CREATE OR REPLACE FUNCTION update_sport_stats(
  p_user_id UUID,
  p_sport_id UUID,
  p_is_correct BOOLEAN,
  p_points INTEGER
)
RETURNS void AS $$
BEGIN
  INSERT INTO user_sport_stats (user_id, sport_id, total_picks, correct_picks, total_points, current_streak, best_streak)
  VALUES (
    p_user_id,
    p_sport_id,
    1,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    p_points,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, sport_id) DO UPDATE SET
    total_picks = user_sport_stats.total_picks + 1,
    correct_picks = user_sport_stats.correct_picks + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    total_points = user_sport_stats.total_points + p_points,
    current_streak = CASE
      WHEN p_is_correct THEN user_sport_stats.current_streak + 1
      ELSE 0
    END,
    best_streak = CASE
      WHEN p_is_correct AND user_sport_stats.current_streak + 1 > user_sport_stats.best_streak
        THEN user_sport_stats.current_streak + 1
      ELSE user_sport_stats.best_streak
    END,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
