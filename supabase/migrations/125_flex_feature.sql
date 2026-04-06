-- Flex feature: users can share their own successful picks/parlays/props to the feed with optional commentary

-- Add flex target FK columns to hot_takes
ALTER TABLE hot_takes ADD COLUMN IF NOT EXISTS flex_pick_id UUID REFERENCES picks(id) ON DELETE CASCADE;
ALTER TABLE hot_takes ADD COLUMN IF NOT EXISTS flex_parlay_id UUID REFERENCES parlays(id) ON DELETE CASCADE;
ALTER TABLE hot_takes ADD COLUMN IF NOT EXISTS flex_prop_pick_id UUID REFERENCES prop_picks(id) ON DELETE CASCADE;

-- Extend post_type check to include 'flex'
ALTER TABLE hot_takes DROP CONSTRAINT IF EXISTS hot_takes_post_type_check;
ALTER TABLE hot_takes ADD CONSTRAINT hot_takes_post_type_check
  CHECK (post_type IN ('post', 'prediction', 'poll', 'flex'));

-- Unique constraints: one flex per user per item
CREATE UNIQUE INDEX IF NOT EXISTS idx_flex_pick_unique ON hot_takes (user_id, flex_pick_id) WHERE flex_pick_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_flex_parlay_unique ON hot_takes (user_id, flex_parlay_id) WHERE flex_parlay_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_flex_prop_unique ON hot_takes (user_id, flex_prop_pick_id) WHERE flex_prop_pick_id IS NOT NULL;

-- Index for feed dedup queries (find flexes by target)
CREATE INDEX IF NOT EXISTS idx_hot_takes_flex_pick ON hot_takes (flex_pick_id) WHERE flex_pick_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hot_takes_flex_parlay ON hot_takes (flex_parlay_id) WHERE flex_parlay_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hot_takes_flex_prop ON hot_takes (flex_prop_pick_id) WHERE flex_prop_pick_id IS NOT NULL;
