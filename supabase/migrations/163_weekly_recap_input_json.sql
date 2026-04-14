-- Store the raw data payload passed to Claude for each weekly recap so
-- admins can audit what the model was given vs what it wrote. Critical
-- for debugging hallucinations — without this, a wrong fact in the recap
-- text can't be traced back to an input source.
ALTER TABLE weekly_recaps
  ADD COLUMN IF NOT EXISTS input_json JSONB;
