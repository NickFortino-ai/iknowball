-- Multi-sport player blurbs.
-- The original table FK'd player_id to nfl_players. Blurbs need to cover NBA,
-- WNBA, MLB (and eventually more), whose "players" live in per-sport salary
-- tables or external rosters keyed by espn_player_id rather than in a unified
-- players table. Drop the FK so the column can store any sport's identifier,
-- and tag every row with the sport so lookups stay unambiguous.

ALTER TABLE player_blurbs DROP CONSTRAINT IF EXISTS player_blurbs_player_id_fkey;

ALTER TABLE player_blurbs
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'nfl';

CREATE INDEX IF NOT EXISTS idx_player_blurbs_sport_player
  ON player_blurbs(sport, player_id);

CREATE INDEX IF NOT EXISTS idx_player_blurbs_sport_status
  ON player_blurbs(sport, status);
