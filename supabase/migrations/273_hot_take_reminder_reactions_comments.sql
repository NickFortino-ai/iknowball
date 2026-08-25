-- Allow reactions + comments on hot-take reminder feed cards.
--
-- HotTakeReminderFeedCard passes targetType="hot_take_reminder" through
-- FeedCardWrapper, which renders both FeedReactions and PickComments — but
-- neither CHECK constraint ever learned the value. So every reaction and
-- every comment on those cards has failed for every user since the card
-- shipped, surfacing as a raw Postgres error toast:
--   new row for relation "comments" violates check constraint
--   "comments_target_type_check"
--
-- This is not version-specific; no client build fixes it.
--
-- Verified against production before writing: every other target_type the
-- client sends is already accepted by both tables. The one other rejection
-- (feed_reactions + 'prop') is unreachable — 'prop' is only ever passed to
-- PickComments, never to FeedReactions — so it is deliberately NOT added
-- here rather than widening a constraint for a value nothing sends.

ALTER TABLE feed_reactions DROP CONSTRAINT IF EXISTS feed_reactions_target_type_check;
ALTER TABLE feed_reactions ADD CONSTRAINT feed_reactions_target_type_check
  CHECK (target_type IN ('pick','parlay','streak_event','record_history','hot_take','head_to_head','futures_pick','league_win','hot_take_reminder'));

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_target_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('pick','parlay','prop','streak_event','record_history','hot_take','head_to_head','futures_pick','league_win','hot_take_reminder'));
