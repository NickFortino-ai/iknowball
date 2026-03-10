-- Change target_id from UUID to TEXT so H2H feed items can use
-- their unique string ID (h2h-userA-userB-gameId) instead of
-- a shared pick UUID that causes comments to appear on multiple cards
ALTER TABLE comments ALTER COLUMN target_id TYPE TEXT;
ALTER TABLE feed_reactions ALTER COLUMN target_id TYPE TEXT;
