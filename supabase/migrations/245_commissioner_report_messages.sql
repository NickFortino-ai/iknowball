-- Turn Commissioner Report tickets into a real back-and-forth thread.
-- The initial commissioner message + first admin reply still live on the
-- commissioner_reports row (from migration 244); this table stores every
-- subsequent message from either side so the conversation can keep going
-- until the ticket is resolved.
--
-- The API hydrates a unified messages array by prepending the initial
-- message + admin_reply from the parent row, so the client can render one
-- clean thread without knowing about the schema split.
CREATE TABLE IF NOT EXISTS commissioner_report_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES commissioner_reports(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_role text NOT NULL CHECK (sender_role IN ('commissioner', 'admin')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissioner_report_messages_report ON commissioner_report_messages(report_id, created_at);

GRANT SELECT, INSERT ON commissioner_report_messages TO authenticated;
GRANT SELECT ON commissioner_report_messages TO anon;
