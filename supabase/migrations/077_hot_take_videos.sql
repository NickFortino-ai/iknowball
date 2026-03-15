ALTER TABLE hot_takes ADD COLUMN video_url TEXT;

INSERT INTO storage.buckets (id, name, public) VALUES ('hot-take-videos', 'hot-take-videos', true);

-- Same RLS pattern as hot-take-images (migration 055)
CREATE POLICY "Anyone can read hot take videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'hot-take-videos');

CREATE POLICY "Users can upload own hot take videos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'hot-take-videos'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

CREATE POLICY "Users can update own hot take videos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'hot-take-videos'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

CREATE POLICY "Users can delete own hot take videos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'hot-take-videos'
    AND auth.uid()::text = split_part(name, '/', 1)
  );
