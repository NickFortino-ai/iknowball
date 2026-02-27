CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('blast', 'targeted')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  recipients_requested TEXT[] DEFAULT '{}',
  recipients_sent TEXT[] DEFAULT '{}',
  recipients_failed TEXT[] DEFAULT '{}',
  recipients_not_found TEXT[] DEFAULT '{}',
  total INTEGER DEFAULT 0,
  sent INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_logs_created ON email_logs(created_at DESC);
