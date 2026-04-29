-- Extend leagues_format_check to allow the four new contest formats:
-- 3-Point Contest, Sacks Contest, Interceptions Contest, Strikeouts Contest.
-- Each was shipped with its own pick + scoring infrastructure but the
-- root leagues table CHECK constraint was missed, so any attempt to
-- INSERT a league with format='three_point' / 'sacks' / 'ints' /
-- 'strikeouts' fails with the constraint violation.

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_format_check
  CHECK (format IN (
    'pickem', 'survivor', 'squares', 'bracket', 'fantasy',
    'nba_dfs', 'mlb_dfs',
    'hr_derby', 'td_pass',
    'three_point', 'sacks', 'ints', 'strikeouts'
  ));
