-- Update feed_reactions constraint to add 'head_to_head' target_type
ALTER TABLE feed_reactions DROP CONSTRAINT IF EXISTS feed_reactions_target_type_check;
ALTER TABLE feed_reactions ADD CONSTRAINT feed_reactions_target_type_check
  CHECK (target_type IN ('pick','parlay','streak_event','record_history','hot_take','head_to_head'));

-- Update comments constraint to add 'head_to_head' target_type
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_target_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('pick', 'parlay', 'prop', 'streak_event', 'record_history', 'hot_take', 'head_to_head'));
