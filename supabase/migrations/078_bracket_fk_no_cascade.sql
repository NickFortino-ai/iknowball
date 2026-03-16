-- Change bracket FK constraints from ON DELETE CASCADE to SET NULL
-- so re-saving template matchups doesn't wipe tournament data and user picks

-- bracket_matchups.template_matchup_id: CASCADE → SET NULL
ALTER TABLE bracket_matchups
  ALTER COLUMN template_matchup_id DROP NOT NULL;

ALTER TABLE bracket_matchups
  DROP CONSTRAINT bracket_matchups_template_matchup_id_fkey,
  ADD CONSTRAINT bracket_matchups_template_matchup_id_fkey
    FOREIGN KEY (template_matchup_id)
    REFERENCES bracket_template_matchups(id)
    ON DELETE SET NULL;

-- bracket_picks.template_matchup_id: CASCADE → SET NULL
ALTER TABLE bracket_picks
  ALTER COLUMN template_matchup_id DROP NOT NULL;

ALTER TABLE bracket_picks
  DROP CONSTRAINT bracket_picks_template_matchup_id_fkey,
  ADD CONSTRAINT bracket_picks_template_matchup_id_fkey
    FOREIGN KEY (template_matchup_id)
    REFERENCES bracket_template_matchups(id)
    ON DELETE SET NULL;
