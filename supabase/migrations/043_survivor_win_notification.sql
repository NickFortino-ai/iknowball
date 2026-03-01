-- Add 'survivor_win' to the notifications type check constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction','comment','streak_milestone','parlay_result',
    'futures_result','connection_request','headlines','squares_quarter_win',
    'record_broken','survivor_result','survivor_win'));
