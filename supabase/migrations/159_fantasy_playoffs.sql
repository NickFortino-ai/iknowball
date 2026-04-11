-- Fantasy playoff bracket support
-- Allow NULL user IDs for pre-generated future playoff rounds (TBD slots)
ALTER TABLE fantasy_matchups ALTER COLUMN home_user_id DROP NOT NULL;
ALTER TABLE fantasy_matchups ALTER COLUMN away_user_id DROP NOT NULL;

-- Playoff metadata columns
ALTER TABLE fantasy_matchups ADD COLUMN IF NOT EXISTS round INTEGER;
ALTER TABLE fantasy_matchups ADD COLUMN IF NOT EXISTS seed_home INTEGER;
ALTER TABLE fantasy_matchups ADD COLUMN IF NOT EXISTS seed_away INTEGER;
ALTER TABLE fantasy_matchups ADD COLUMN IF NOT EXISTS is_consolation BOOLEAN DEFAULT FALSE;
ALTER TABLE fantasy_matchups ADD COLUMN IF NOT EXISTS bracket_position INTEGER;

-- Index for fast bracket lookups
CREATE INDEX IF NOT EXISTS idx_fantasy_matchups_round ON fantasy_matchups (league_id, round) WHERE round IS NOT NULL;

-- Add new notification types for playoff events
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
  'fantasy_playoff_advanced', 'fantasy_playoff_eliminated', 'fantasy_champion'
));
