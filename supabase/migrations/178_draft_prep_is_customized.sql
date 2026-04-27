-- Track whether a user has actually customized their draft-prep board for
-- a given (roster, scoring) combination. Lazy-seeded boards (visited but
-- never reordered) and boards that were "Reset to ADP" should NOT show up
-- in the user's Saved Rankings picker — they aren't really saved, they're
-- just default ADP for that roster shape.
--
-- A column on draft_prep_rankings is the simplest place for this since
-- every row already shares the same (user, roster, scoring) key. We flip
-- the flag on every row in a board atomically when it's saved/reset.
ALTER TABLE draft_prep_rankings
  ADD COLUMN IF NOT EXISTS is_customized BOOLEAN NOT NULL DEFAULT false;

-- Backfill: assume existing boards are customized so the picker doesn't go
-- empty for everyone the moment this ships. Going forward, only explicit
-- saves (drag/reorder) will flip the flag, and Reset to ADP will clear it.
UPDATE draft_prep_rankings SET is_customized = true WHERE is_customized = false;

-- Filter index — Saved Rankings query reads only customized rows by user.
CREATE INDEX IF NOT EXISTS idx_draft_prep_rankings_customized
  ON draft_prep_rankings (user_id, is_customized)
  WHERE is_customized = true;
