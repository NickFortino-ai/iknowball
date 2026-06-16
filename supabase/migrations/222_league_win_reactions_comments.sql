-- Allow reactions + comments on league_win feed cards (Hub posts that
-- celebrate a user winning a league / survivor pool / bracket). Latest
-- prior constraint (migration 082) covered pick / parlay / streak_event /
-- record_history / hot_take / head_to_head / futures_pick — adding
-- league_win so the Hub feed's trophy cards aren't second-class.

ALTER TABLE feed_reactions DROP CONSTRAINT IF EXISTS feed_reactions_target_type_check;
ALTER TABLE feed_reactions ADD CONSTRAINT feed_reactions_target_type_check
  CHECK (target_type IN ('pick','parlay','streak_event','record_history','hot_take','head_to_head','futures_pick','league_win'));

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_target_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('pick','parlay','prop','streak_event','record_history','hot_take','head_to_head','futures_pick','league_win'));
