-- Admin-set tournament end date for bracket templates. Used to auto-fill
-- league.ends_at when a commissioner creates a bracket league from this
-- template, so the league card can show "Runs Jun 28 – Jul 19" instead
-- of "Jun 28 – TBD" without each commissioner having to know the date.
ALTER TABLE bracket_templates ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
