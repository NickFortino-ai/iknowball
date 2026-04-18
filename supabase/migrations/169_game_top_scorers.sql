-- Store leading scorers per team per game (fetched from ESPN box scores)
CREATE TABLE IF NOT EXISTS game_top_scorers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team TEXT NOT NULL,
  player_name TEXT NOT NULL,
  points INTEGER NOT NULL,
  headshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (game_id, team)
);

CREATE INDEX idx_game_top_scorers_game ON game_top_scorers (game_id);
