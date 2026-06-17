-- Remote-config table for server-driven UI knobs. Admin edits values
-- from the admin panel; clients read via GET /app-config (5-min cache).
-- Foundation memo: project_remote_config_idea.md.
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Public read so the GET endpoint is cacheable; only service_role writes
-- (admin endpoint writes via the service-role client server-side).
GRANT SELECT ON app_config TO anon, authenticated;

-- Seed the two initial knobs with current hardcoded defaults so behavior
-- doesn't change until admin edits them.
INSERT INTO app_config (key, value) VALUES
  ('news_tab_order', '["nba","nfl","mlb","nhl"]'::jsonb),
  ('leaderboard_default_tab_order',
    '["Global","NBA","NCAAB","WNCAAB","MLB","NHL","MLS","Picks","Props","Parlays","Leagues","NFL","NCAAF","UFL","WNBA"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
