-- Persist the Status Flags explainer banner's "Understood" dismissal per-user
-- instead of per-device. localStorage was reasonable for the first pass but
-- users who see the banner on their phone still saw it again on desktop.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_dismissed_readiness_banner BOOLEAN NOT NULL DEFAULT false;
