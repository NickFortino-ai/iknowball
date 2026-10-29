-- Reactions + comments on the GROUPED futures card.
--
-- When several users call the same futures market correctly, the feed now
-- publishes one card for the market ("4 of 16 IKB'ers called it") instead of
-- N near-identical individual cards. Its reaction target is the MARKET, not
-- any one caller's pick — if it were keyed to a pick, the reactions would
-- move or vanish the moment another caller joined the group.
--
-- 'futures_pick' stays: a market only ONE person called still renders as an
-- individual card, deliberately, because a solo correct call is often the
-- most impressive version of it.

ALTER TABLE feed_reactions DROP CONSTRAINT IF EXISTS feed_reactions_target_type_check;
ALTER TABLE feed_reactions ADD CONSTRAINT feed_reactions_target_type_check
  CHECK (target_type IN ('pick','parlay','streak_event','record_history','hot_take','head_to_head','futures_pick','league_win','hot_take_reminder','futures_group'));

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_target_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('pick','parlay','prop','streak_event','record_history','hot_take','head_to_head','futures_pick','league_win','hot_take_reminder','futures_group'));
