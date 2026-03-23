-- Migrate pick_reactions into feed_reactions
INSERT INTO feed_reactions (target_type, target_id, user_id, reaction_type, created_at)
SELECT 'pick', pick_id, user_id, reaction_type, created_at
FROM pick_reactions
ON CONFLICT (target_type, target_id, user_id, reaction_type) DO NOTHING;
