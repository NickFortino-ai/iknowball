-- Per-template centerpiece image (admin uploads, replaces hardcoded NCAA fog)
ALTER TABLE bracket_templates
  ADD COLUMN IF NOT EXISTS bracket_image TEXT,
  ADD COLUMN IF NOT EXISTS bracket_image_x NUMERIC DEFAULT 50,
  ADD COLUMN IF NOT EXISTS bracket_image_y NUMERIC DEFAULT 50,
  ADD COLUMN IF NOT EXISTS bracket_image_scale NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS bracket_image_opacity NUMERIC DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS bracket_image_position TEXT DEFAULT 'behind'
    CHECK (bracket_image_position IN ('behind', 'above_finals'));

-- Public bucket for template centerpiece images
INSERT INTO storage.buckets (id, name, public)
VALUES ('bracket-images', 'bracket-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read; admin write enforced at app layer (server uses service role)
DROP POLICY IF EXISTS "Public read bracket images" ON storage.objects;
CREATE POLICY "Public read bracket images" ON storage.objects
  FOR SELECT USING (bucket_id = 'bracket-images');

DROP POLICY IF EXISTS "Authenticated upload bracket images" ON storage.objects;
CREATE POLICY "Authenticated upload bracket images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bracket-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated update bracket images" ON storage.objects;
CREATE POLICY "Authenticated update bracket images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'bracket-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated delete bracket images" ON storage.objects;
CREATE POLICY "Authenticated delete bracket images" ON storage.objects
  FOR DELETE USING (bucket_id = 'bracket-images' AND auth.role() = 'authenticated');

-- Migrate existing NCAA basketball templates to use the existing /bracket-bg.png path
-- so the rendering goes through one unified code path going forward.
UPDATE bracket_templates
SET bracket_image = '/bracket-bg.png',
    bracket_image_y = 100,
    bracket_image_opacity = 0.4,
    bracket_image_position = 'behind'
WHERE sport IN ('basketball_ncaab', 'basketball_wncaab')
  AND bracket_image IS NULL;
