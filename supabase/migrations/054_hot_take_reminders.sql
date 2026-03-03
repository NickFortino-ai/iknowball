-- Hot take reminders: let squad members resurface old hot takes
CREATE TABLE hot_take_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hot_take_id UUID NOT NULL REFERENCES hot_takes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hot_take_reminders_created ON hot_take_reminders (created_at DESC);
CREATE INDEX idx_hot_take_reminders_user ON hot_take_reminders (reminder_user_id);
CREATE INDEX idx_hot_take_reminders_take ON hot_take_reminders (hot_take_id);

ALTER TABLE hot_take_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reminders"
  ON hot_take_reminders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own reminders"
  ON hot_take_reminders FOR INSERT
  TO authenticated
  WITH CHECK (reminder_user_id = auth.uid());

-- Update notifications constraint to include hot_take_reminder
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction','comment','streak_milestone','parlay_result',
    'futures_result','connection_request','headlines','squares_quarter_win',
    'record_broken','survivor_result','survivor_win','league_deleted','league_win',
    'hot_take_reminder'));
