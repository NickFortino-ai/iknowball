-- Add picks_available_at to bracket_templates (nullable — if not set, picks available immediately)
ALTER TABLE bracket_templates ADD COLUMN picks_available_at TIMESTAMPTZ;

-- Add template_blast to email_logs type constraint
ALTER TABLE email_logs DROP CONSTRAINT email_logs_type_check;
ALTER TABLE email_logs ADD CONSTRAINT email_logs_type_check CHECK (type IN ('blast', 'targeted', 'template_blast'));
