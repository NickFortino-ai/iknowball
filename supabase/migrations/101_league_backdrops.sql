CREATE TABLE IF NOT EXISTS league_backdrops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  formats TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE league_backdrops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view backdrops" ON league_backdrops FOR SELECT TO authenticated USING (true);
