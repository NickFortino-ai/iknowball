-- Persist the "tap a row to see roster, tap avatar for profile" explainer
-- banner's "Understood" dismissal per-user (mirrors readiness banner pattern).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_dismissed_standings_roster_banner BOOLEAN NOT NULL DEFAULT false;
