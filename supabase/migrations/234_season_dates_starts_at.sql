-- Regular season START date per sport per year. Together with
-- regular_season_ends_at and playoff_ends_at, gives the client a
-- complete picture of every sport's calendar without any hardcoded
-- fallback dates. Nullable so existing rows stay valid; admin can
-- backfill via the SeasonDatesPanel.

ALTER TABLE season_dates
  ADD COLUMN IF NOT EXISTS regular_season_starts_at TIMESTAMPTZ NULL;
