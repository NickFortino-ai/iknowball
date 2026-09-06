-- Records WHEN a league's autodraft flags last changed.
--
-- fantasy_settings.auto_drafting_users is a bare UUID[], so the autopick
-- loop could not tell a manager who was flagged BEFORE their turn started
-- (genuinely absent — pick instantly, that's the whole point of the flag)
-- from one flagged DURING their turn (present and mid-decision).
--
-- The commissioner is prompted after a manager misses a pick, and that
-- prompt refers to a pick that already happened. Answering it flagged the
-- user immediately, so the next autopick sweep took the pick away from
-- whoever happened to be on the clock at that moment — with time still on
-- it. Reported live during The Friends League draft on 2026-09-05:
-- "I thought I had 30 seconds and now I only have 10", followed by a pick
-- they didn't make.
--
-- With this column, processDraftAutopicks compares the flag's timestamp
-- against the current pick's clock start. A flag set mid-turn applies from
-- that manager's NEXT turn instead. Absent managers are unaffected — their
-- flag predates the turn, so they still pick instantly.
--
-- Nullable with no backfill. NULL reads as "flagged long ago", which
-- preserves today's instant-pick behaviour for any league mid-draft when
-- this ships.

ALTER TABLE fantasy_settings
  ADD COLUMN IF NOT EXISTS auto_draft_updated_at TIMESTAMPTZ;
