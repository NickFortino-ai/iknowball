CREATE TABLE IF NOT EXISTS link_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT,
  image TEXT,
  site_name TEXT,
  youtube_video_id TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE link_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Link previews readable by authenticated"
  ON link_previews FOR SELECT TO authenticated USING (true);
