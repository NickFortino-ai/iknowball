-- Add pending_review status for commissioner-reviewed trades
ALTER TABLE fantasy_trades DROP CONSTRAINT IF EXISTS fantasy_trades_status_check;
ALTER TABLE fantasy_trades ADD CONSTRAINT fantasy_trades_status_check
  CHECK (status IN ('pending', 'pending_review', 'accepted', 'declined', 'cancelled', 'vetoed'));

-- Add fantasy_trade_vetoed notification type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'reaction', 'comment', 'streak_milestone', 'parlay_result', 'futures_result',
  'connection_request', 'connection_accepted', 'headlines',
  'squares_quarter_win', 'record_broken', 'survivor_result', 'survivor_win',
  'league_deleted', 'league_win', 'hot_take_reminder', 'hot_take_callout',
  'league_invitation', 'league_thread_mention', 'direct_message', 'league_report',
  'nfl_injury_warning',
  'fantasy_trade_proposed', 'fantasy_trade_accepted', 'fantasy_trade_declined',
  'fantasy_trade_vetoed', 'fantasy_trade_approved',
  'fantasy_waiver_awarded', 'fantasy_waiver_failed', 'fantasy_stat_correction',
  'fantasy_draft_started', 'fantasy_draft_starting_soon',
  'fantasy_league_underfilled', 'fantasy_league_canceled',
  'fantasy_league_member_dropped', 'fantasy_league_resized',
  'fantasy_draft_postponed', 'fantasy_draft_order_set',
  'fantasy_matchup_result'
));
