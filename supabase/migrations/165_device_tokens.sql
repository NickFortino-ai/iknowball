-- Native push notification tokens (APNs for iOS, FCM for future Android).
-- A user can have multiple devices, so this is a separate row per device.
-- We upsert on (user_id, token) since the same token can only ever belong
-- to one user/device pair.

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens (user_id);

-- RLS: users can only see/modify their own tokens; server (service role)
-- bypasses RLS by default so notification fan-out works without extra policies.
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own device tokens"
  ON device_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users can insert own device tokens"
  ON device_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can delete own device tokens"
  ON device_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());
