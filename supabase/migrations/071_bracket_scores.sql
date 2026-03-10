-- Add score columns to bracket matchup tables
ALTER TABLE bracket_template_matchups
  ADD COLUMN score_top INTEGER,
  ADD COLUMN score_bottom INTEGER;

ALTER TABLE bracket_matchups
  ADD COLUMN score_top INTEGER,
  ADD COLUMN score_bottom INTEGER;
