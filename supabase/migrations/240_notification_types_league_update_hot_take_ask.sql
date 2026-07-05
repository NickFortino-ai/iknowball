-- Two latent notification types missing from the CHECK constraint that
-- would silently break existing code paths the first time they fire:
--
--   'league_update'  — scoreNBADFS / scoreWNBADFS "you didn't submit a
--                      roster in time for {league}" notification. Fires
--                      when a single-night DFS league passes its
--                      join lock without a member submitting a lineup.
--   'hot_take_ask'   — hotTakeService "@user wants to hear from you"
--                      notification. Fires when a user asks a specific
--                      other user to share a hot take.
--
-- Both were introduced to the app code but never added to the
-- notifications.type CHECK constraint. Insert would fail with a
-- CHECK constraint violation on first fire, aborting whatever job
-- called it (DFS scoring or the ask handler).

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
  'league_update', 'hot_take_ask'
));
