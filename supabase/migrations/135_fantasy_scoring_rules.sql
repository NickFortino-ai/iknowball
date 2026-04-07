-- Custom NFL fantasy scoring rules per league.
-- JSONB so commissioners can fully customize without schema migrations.
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS scoring_rules JSONB;
