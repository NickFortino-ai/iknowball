-- Two unrelated-but-small additions.
--
-- 1. users.last_active_at
--
-- The admin dashboard's DAU counted distinct user_ids in `picks`. That was
-- written when game picks WERE the product, and it now misses fantasy
-- drafts, DFS lineups, survivor picks, props and parlays entirely. On
-- 2026-09-05 -- the day after a 14-person fantasy draft -- it reported 3
-- while 19 distinct users had actually been active.
--
-- device_tokens.updated_at was the other candidate and is worse: push
-- registration returns early on web (Capacitor.isNativePlatform()), so only
-- 49 of 166 users have a token at all. It would have hidden 70% of the user
-- base, and specifically all of the web audience.
--
-- requireAuth stamps this column, throttled to once per 15 minutes per
-- user, so an active user costs at most 4 writes an hour. `users` is not in
-- the supabase_realtime publication, so these writes carry no fan-out cost.
--
-- Nullable with no backfill: existing users simply read as inactive until
-- their next authenticated request, which is accurate.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Supports the DAU query (last_active_at >= now() - interval '24 hours').
CREATE INDEX IF NOT EXISTS idx_users_last_active_at
  ON users (last_active_at DESC NULLS LAST);


-- 2. 'league_member_left' notification type
--
-- Leaving a league notified nobody. A manager could walk the night before
-- the draft and the commissioner would find out when the room came up a
-- team short -- with the draft order already built around the old count.
--
-- notifications.type is a CHECK constraint, and an unlisted value fails the
-- insert silently from the caller's perspective, so the type has to be
-- added here before anything can send it.
--
-- Distinct from the existing 'fantasy_league_member_dropped', which goes TO
-- a member who was dropped during auto-resize. This one goes to the
-- COMMISSIONER when someone leaves on their own.

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
  'commissioner_lineup_forced',
  'commissioner_add_drop',
  'writer_granted',
  'league_member_left'
));
