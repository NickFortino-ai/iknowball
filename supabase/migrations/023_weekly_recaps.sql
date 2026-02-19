CREATE TABLE IF NOT EXISTS weekly_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,
  week_end DATE NOT NULL,
  recap_content TEXT NOT NULL,
  featured_user_ids UUID[] DEFAULT '{}',
  pick_of_week_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  biggest_fall_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  longest_streak_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_recaps_created ON weekly_recaps(created_at DESC);

-- Update notification type constraint (add connection_request + power_rankings)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction','comment','streak_milestone','parlay_result',
    'futures_result','connection_request','power_rankings'));
