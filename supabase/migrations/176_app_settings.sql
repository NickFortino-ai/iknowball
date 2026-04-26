-- Global key/value store for site-wide admin-tunable settings.
-- First use case: vertical position (backdrop_y) of the FF Draft Prep
-- page hero backdrop. Public read, admin write.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_public_read ON app_settings
  FOR SELECT USING (true);
