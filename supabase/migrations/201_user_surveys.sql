-- Pre/post league surveys for informal psychology experiments. Admin
-- designates an open league before it starts; the modal then prompts
-- members for an entry survey on first visit, and an exit survey after
-- the league's ends_at has passed.

-- Designation flag on the league itself. Stays false unless an admin
-- flips it; locks once the league has started (enforced in the admin
-- route, not the DB, so we can still toggle in emergencies).
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS survey_enabled BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_leagues_survey_enabled
  ON leagues(survey_enabled)
  WHERE survey_enabled = true;

-- One row per (user, league, survey_type). Either responses is set
-- (answered) or dismissed_at is set (permanently declined). The modal
-- treats both as "don't ask again."
CREATE TABLE IF NOT EXISTS user_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  survey_type TEXT NOT NULL CHECK (survey_type IN ('entry', 'exit')),
  responses JSONB,
  dismissed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, league_id, survey_type)
);

CREATE INDEX IF NOT EXISTS idx_user_surveys_league
  ON user_surveys(league_id, survey_type);

-- Add survey_invite notification type for the 24h-after-end nudge.
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
  'invite_requested', 'survivor_pick_reminder', 'survey_invite'
));
