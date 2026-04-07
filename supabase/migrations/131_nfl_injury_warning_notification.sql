-- Add nfl_injury_warning to the notifications type CHECK constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'reaction', 'comment', 'streak_milestone', 'parlay_result', 'futures_result',
    'connection_request', 'connection_accepted', 'headlines', 'squares_quarter_win',
    'record_broken', 'survivor_result', 'survivor_win', 'league_deleted', 'league_win',
    'hot_take_reminder', 'hot_take_callout', 'league_invitation', 'league_thread_mention',
    'direct_message', 'league_report', 'nfl_injury_warning'
  ));
