-- Create avatars storage bucket (public for reading)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Anyone can read avatars
CREATE POLICY "Anyone can read avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Users can upload their own avatar (file named {user_id}.webp)
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = split_part(name, '.', 1));

-- Users can update their own avatar
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = split_part(name, '.', 1));

-- Users can delete their own avatar
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = split_part(name, '.', 1));
