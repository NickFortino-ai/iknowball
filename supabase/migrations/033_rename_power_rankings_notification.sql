-- Rename power_rankings notification type to headlines
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

UPDATE notifications SET type = 'headlines' WHERE type = 'power_rankings';

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction','comment','streak_milestone','parlay_result',
    'futures_result','connection_request','headlines','squares_quarter_win'));
