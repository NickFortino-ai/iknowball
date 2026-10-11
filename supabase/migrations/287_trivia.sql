-- Arcade trivia.
--
-- TWO SOURCES, HANDLED DIFFERENTLY ON PURPOSE.
--
-- Questions GENERATED from our own stats are computed at SERVE time and never
-- stored. That is the whole point: a question generated on Sunday ("who led
-- Week 5 in rushing yards?") can become wrong on Tuesday when a stat
-- correction lands — we fixed those correction notifications days ago, so we
-- know they are real and routine. A stored answer would quietly rot. Computing
-- at serve time means the answer is derived from the data as it stands the
-- moment it is asked, and staleness cannot happen.
--
-- Questions AUTHORED by a person (or drafted by AI) have no such source of
-- truth, so they live here and go through review before anyone sees them.
-- Same shape as the player-blurb workflow: drafts are written freely,
-- publishing is a deliberate act, and nothing unreviewed reaches a user.
CREATE TABLE IF NOT EXISTS trivia_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A sport key ('americanfootball_nfl') or 'all' for sport-agnostic
  -- questions. Mirrors the arcade variant so one filter serves both games.
  sport TEXT NOT NULL DEFAULT 'all',
  question TEXT NOT NULL,
  -- Four choices, stored in a fixed order. The order shown to the player is
  -- shuffled per round, so a correct index cannot be learned by position.
  choices JSONB NOT NULL,
  answer_index INTEGER NOT NULL CHECK (answer_index >= 0),
  explanation TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  times_served INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The serving query: published questions for one sport.
CREATE INDEX IF NOT EXISTS idx_trivia_questions_serve
  ON trivia_questions(status, sport);

-- The review queue.
CREATE INDEX IF NOT EXISTS idx_trivia_questions_review
  ON trivia_questions(status, created_at DESC);

ALTER TABLE trivia_questions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trivia_questions TO service_role;

-- A round's questions and their correct answers, held server-side.
--
-- The answers are NEVER sent to the client — a quiz that ships its own answer
-- key is not a quiz. The client receives questions and choices; this column
-- is what the finish call scores against.
ALTER TABLE arcade_rounds ADD COLUMN IF NOT EXISTS payload JSONB;
