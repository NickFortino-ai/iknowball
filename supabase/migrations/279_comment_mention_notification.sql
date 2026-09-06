-- New notification type: someone @mentioned you in a comment.
--
-- League threads have supported @mentions for a while, which taught people
-- the gesture works — but typing "@someone" in a comment was plain text.
-- No autocomplete, no highlight, and the person named was never told.
--
-- Distinct from 'comment' (someone commented on your pick) and from
-- 'league_thread_mention' (mentioned in a league thread). Push-eligible,
-- like the thread equivalent: being named is a direct address and deserves
-- to reach you, unlike a generic comment on a post.
--
-- notifications.type is a CHECK constraint and an unlisted value fails the
-- insert, so the type has to exist here before anything can send it.

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
  'league_member_left',
  'comment_mention'
));
