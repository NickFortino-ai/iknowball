-- Commissioner "Report a Problem" support tickets. Distinct from user
-- content moderation reports (which live in hot_take_reports / user_reports)
-- — these are direct communications from a league commissioner to the
-- admin about issues with their league, waiting for a reply.
--
-- Lifecycle: open → replied (admin has responded) → resolved (admin marks
-- as handled). Commissioners can create; admin can reply + mark resolved.
CREATE TABLE IF NOT EXISTS commissioner_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  commissioner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'resolved')),
  admin_reply text,
  admin_replied_at timestamptz,
  admin_replier_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissioner_reports_league ON commissioner_reports(league_id);
CREATE INDEX IF NOT EXISTS idx_commissioner_reports_status_created ON commissioner_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissioner_reports_commissioner ON commissioner_reports(commissioner_id);

-- Per the 2026-10-30 Data API auto-grant cutover, every new table needs
-- explicit anon/authenticated grants for the PostgREST layer to see it.
GRANT SELECT, INSERT, UPDATE ON commissioner_reports TO authenticated;
GRANT SELECT ON commissioner_reports TO anon;

-- New notification type for when the admin replies to a report.
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
  'commissioner_report_reply'
));
