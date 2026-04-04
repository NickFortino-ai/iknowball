-- NBA Playoff Bracket support: series length predictions + best-of-7 tracking

-- Series length prediction on picks (4, 5, 6, or 7)
ALTER TABLE bracket_picks ADD COLUMN IF NOT EXISTS series_length INTEGER;

-- Series format flag on templates (single_elimination vs best_of_7)
ALTER TABLE bracket_templates ADD COLUMN IF NOT EXISTS series_format TEXT DEFAULT 'single_elimination';

-- Series win tracking on matchups (e.g., Thunder 4 - Clippers 2)
ALTER TABLE bracket_matchups ADD COLUMN IF NOT EXISTS series_wins_top INTEGER DEFAULT 0;
ALTER TABLE bracket_matchups ADD COLUMN IF NOT EXISTS series_wins_bottom INTEGER DEFAULT 0;
ALTER TABLE bracket_matchups ADD COLUMN IF NOT EXISTS actual_series_length INTEGER;

-- Same on template matchups for admin result entry
ALTER TABLE bracket_template_matchups ADD COLUMN IF NOT EXISTS series_wins_top INTEGER DEFAULT 0;
ALTER TABLE bracket_template_matchups ADD COLUMN IF NOT EXISTS series_wins_bottom INTEGER DEFAULT 0;
ALTER TABLE bracket_template_matchups ADD COLUMN IF NOT EXISTS actual_series_length INTEGER;
