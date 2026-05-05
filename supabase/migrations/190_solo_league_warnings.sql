-- 190_solo_league_warnings.sql
-- Tracks the at-risk warning sent to a commissioner whose league has only one
-- member. Pairs with the autoCancelSoloLeagues / processSoloLeagueWarnings
-- jobs which warn at ~6h before starts_at and auto-cancel on or after starts_at
-- if still solo. Squares is excluded from the flow entirely (single-game format,
-- can be played solo and never awards a global bonus regardless).

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS solo_warning_sent_at TIMESTAMPTZ;

-- Two new notification types so we can deep-link the at-risk warning and the
-- post-cancel notice.
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
  'poll_response_milestone',
  'league_at_risk', 'league_canceled_solo'
));
