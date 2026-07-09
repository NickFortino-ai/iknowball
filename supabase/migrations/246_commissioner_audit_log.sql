-- Audit log for commissioner-only actions (force lineup, override matchup,
-- add/drop for a user, trade veto, transfer ownership, etc). Every action
-- writes a row here so leaguemates can inspect what the commissioner has
-- done. Foundational for the whole commissioner-tools framework — Phase 1
-- ships Force Lineup which is the first writer, but future tools plug into
-- the same shape.
--
-- action: e.g. 'force_lineup', 'override_matchup', 'add_drop_for_user'
-- target_user_id: whose team/roster/matchup was affected (nullable for
--                 league-level actions like transfer_ownership)
-- before_state / after_state: JSONB snapshots for reversibility auditing
CREATE TABLE IF NOT EXISTS commissioner_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  commissioner_id uuid NOT NULL REFERENCES users(id),
  target_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  details jsonb,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissioner_audit_log_league ON commissioner_audit_log(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissioner_audit_log_target ON commissioner_audit_log(target_user_id, created_at DESC);

GRANT SELECT ON commissioner_audit_log TO authenticated;
GRANT SELECT ON commissioner_audit_log TO anon;
GRANT INSERT ON commissioner_audit_log TO authenticated;

-- New notification type for when a commissioner forces a change on a user's
-- team. Read by the user whose lineup was overridden.
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
  'fantasy_bye_warning',
  'poll_response_milestone',
  'league_at_risk', 'league_canceled_solo',
  'invite_requested', 'survivor_pick_reminder', 'survey_invite',
  'roster_reminder', 'og_welcome', 'bracket_published',
  'fantasy_draft_scheduled',
  'league_update', 'hot_take_ask',
  'commissioner_report_reply',
  'commissioner_lineup_forced'
));
