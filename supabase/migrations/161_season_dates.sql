-- Admin-defined regular season end dates per sport per year.
-- When set, full_season leagues in that sport will have their ends_at
-- clamped to this date so they complete on time.
CREATE TABLE IF NOT EXISTS season_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_key TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  regular_season_ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sport_key, season_year)
);

ALTER TABLE season_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view season dates" ON season_dates FOR SELECT TO authenticated USING (true);
