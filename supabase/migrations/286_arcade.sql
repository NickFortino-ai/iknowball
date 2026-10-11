-- IKB Arcade: scores and in-flight rounds.
--
-- Arcade results are deliberately SEPARATE from IKB points. total_points,
-- tiers and the record book are earned on predictions, and a memory game
-- must not be able to move someone up a tier. Each arcade game keeps its own
-- leaderboard; nothing here touches users.total_points.
--
-- Grants follow 284_data_api_grants: service_role only. The browser never
-- reaches PostgREST — every read and write goes through Express — so anon and
-- authenticated would widen the surface for no caller. RLS is enabled on both
-- tables regardless, since grants and row security are separate concerns.

-- A round in progress. Created when the deck is dealt, closed when the player
-- finishes.
--
-- This table exists so the SERVER owns the clock. Without it the client would
-- post its own elapsed time and the leaderboard would be an honour system —
-- `started_at` is written here and the duration is computed server-side on
-- finish, so a fast time has to actually be fast.
--
-- It cannot make a client-side memory game uncheatable: the deck is sent to
-- the browser, so anyone reading the network tab can see every card. The
-- point is bounding the absurd (a 0-second, 6-move perfect round), not
-- perfect integrity.
CREATE TABLE IF NOT EXISTS arcade_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_key TEXT NOT NULL,
  -- Which set the round was played from: a sport key, a contest format key,
  -- or 'all'. Leaderboards are per (game_key, variant).
  variant TEXT NOT NULL DEFAULT 'all',
  pairs INTEGER NOT NULL CHECK (pairs > 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arcade_rounds_user ON arcade_rounds(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS arcade_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES arcade_rounds(id) ON DELETE SET NULL,
  game_key TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'all',
  score INTEGER NOT NULL CHECK (score >= 0),
  -- Kept alongside the score so a leaderboard row can show HOW it was earned
  -- ("8 pairs in 19 moves, 41s") rather than a bare number, and so the
  -- scoring formula can be changed later without the history becoming
  -- unreadable.
  pairs INTEGER,
  moves INTEGER,
  -- Misses where the SECOND card flipped had already been revealed earlier.
  -- Those are the only ones that cost points: flipping a card you have never
  -- seen is information gathering, not a mistake, so exploring is free and
  -- forgetting is not.
  informed_misses INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The leaderboard query: best scores for one game+variant.
CREATE INDEX IF NOT EXISTS idx_arcade_scores_board
  ON arcade_scores(game_key, variant, score DESC, duration_ms ASC);

-- "my scores" and personal best.
CREATE INDEX IF NOT EXISTS idx_arcade_scores_user
  ON arcade_scores(user_id, game_key, variant, score DESC);

-- One score row per round, so a replayed or double-submitted finish cannot
-- post the same result twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_arcade_scores_round_once
  ON arcade_scores(round_id) WHERE round_id IS NOT NULL;

ALTER TABLE arcade_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_scores ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arcade_rounds TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arcade_scores TO service_role;
