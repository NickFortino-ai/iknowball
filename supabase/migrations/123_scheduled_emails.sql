-- Scheduled email support
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'sent' CHECK (email_status IN ('sent', 'scheduled', 'sending'));

-- Mark existing rows as sent
UPDATE email_logs SET email_status = 'sent' WHERE email_status IS NULL;

-- Index for the cron job to find pending scheduled emails
CREATE INDEX IF NOT EXISTS idx_email_logs_scheduled ON email_logs (email_status, scheduled_at) WHERE email_status = 'scheduled';
