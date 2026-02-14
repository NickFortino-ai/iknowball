-- Move bracket results to template level (admin-only)
ALTER TABLE bracket_template_matchups
  ADD COLUMN winner TEXT CHECK (winner IN ('top', 'bottom')),
  ADD COLUMN winning_team_name TEXT;
