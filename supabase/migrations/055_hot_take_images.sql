-- Add image_url column to hot_takes
ALTER TABLE hot_takes ADD COLUMN image_url TEXT;

-- Create hot-take-images storage bucket (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('hot-take-images', 'hot-take-images', true);

-- Anyone can read hot take images
CREATE POLICY "Anyone can read hot take images" ON storage.objects
  FOR SELECT USING (bucket_id = 'hot-take-images');

-- Authenticated users can upload to their own path {user_id}/*
CREATE POLICY "Users can upload own hot take images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'hot-take-images'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Users can update their own hot take images
CREATE POLICY "Users can update own hot take images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'hot-take-images'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Users can delete their own hot take images
CREATE POLICY "Users can delete own hot take images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'hot-take-images'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Allow UPDATE on hot_takes so image_url can be set after upload
CREATE POLICY "Users can update their own hot takes"
  ON hot_takes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
