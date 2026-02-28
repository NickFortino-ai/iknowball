-- Add flag to prevent reprocessing missed picks for the same week
ALTER TABLE league_weeks ADD COLUMN IF NOT EXISTS missed_picks_processed BOOLEAN DEFAULT false;
