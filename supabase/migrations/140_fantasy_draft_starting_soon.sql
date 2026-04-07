-- Pre-start notification dedup flag and new notification type.
ALTER TABLE fantasy_settings
  ADD COLUMN IF NOT EXISTS draft_pre_start_notified_at TIMESTAMPTZ;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'reaction','comment','streak_milestone','parlay_result','futures_result',
  'connection_request','connection_accepted','headlines','squares_quarter_win',
  'record_broken','survivor_result','survivor_win','league_deleted','league_win',
  'hot_take_reminder','hot_take_callout','league_invitation','league_thread_mention',
  'direct_message','league_report','nfl_injury_warning',
  'fantasy_trade_proposed','fantasy_trade_accepted','fantasy_trade_declined',
  'fantasy_waiver_awarded','fantasy_waiver_failed',
  'fantasy_stat_correction','fantasy_draft_started','fantasy_draft_starting_soon'
)) NOT VALID;
