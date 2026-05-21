-- Stat coverage log + admin_alert notification type
--
-- The log table records every verifier pass so we can see trends like
-- "ESPN dropped Sale stats three days in a row" or "Strikeouts has
-- been auto-healing 2-3 picks per night for the past week".

CREATE TABLE IF NOT EXISTS stat_coverage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_date DATE NOT NULL,
  contest TEXT NOT NULL,
  picks_count INTEGER NOT NULL DEFAULT 0,
  healed_count INTEGER NOT NULL DEFAULT 0,
  unfixable_count INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stat_coverage_log_date ON stat_coverage_log(check_date DESC, contest);

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
  'league_at_risk', 'league_canceled_solo',
  'invite_requested', 'survivor_pick_reminder', 'survey_invite',
  'roster_reminder', 'og_welcome', 'admin_alert'
));
