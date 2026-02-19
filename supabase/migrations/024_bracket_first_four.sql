-- Allow 68-team brackets for March Madness First Four
ALTER TABLE bracket_templates DROP CONSTRAINT bracket_templates_team_count_check;
ALTER TABLE bracket_templates ADD CONSTRAINT bracket_templates_team_count_check
  CHECK (team_count IN (4, 8, 16, 32, 64, 68));
