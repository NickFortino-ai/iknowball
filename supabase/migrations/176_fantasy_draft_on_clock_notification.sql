-- Allow per-pick "you're on the clock" notifications during a fantasy draft.
-- Sent when the active pick advances to a new user, so the bell + APNs push
-- can wake users who've left the league entirely.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'reaction', 'comment', 'streak_milestone', 'parlay_result', 'futures_result',
  'connection_request', 'connection_accepted', 'headlines',
  'squares_quarter_win', 'record_broken', 'survivor_result', 'survivor_win',
  'league_deleted', 'league_win', 'hot_take_reminder', 'hot_take_callout',
  'league_invitation', 'league_thread_mention', 'direct_message', 'league_report',
  'nfl_injury_warning', 'fantasy_trade_proposed', 'fantasy_trade_accepted',
  'fantasy_trade_declined', 'fantasy_trade_vetoed', 'fantasy_trade_approved',
  'fantasy_waiver_awarded', 'fantasy_waiver_failed', 'fantasy_stat_correction',
  'fantasy_draft_started', 'fantasy_draft_starting_soon', 'fantasy_league_underfilled',
  'fantasy_league_canceled', 'fantasy_league_member_dropped', 'fantasy_league_resized',
  'fantasy_draft_postponed', 'fantasy_draft_order_set', 'fantasy_matchup_result',
  'fantasy_playoff_clinched', 'fantasy_playoff_missed',
  'fantasy_playoff_advanced', 'fantasy_playoff_eliminated', 'fantasy_champion',
  'fantasy_draft_on_clock'
));
