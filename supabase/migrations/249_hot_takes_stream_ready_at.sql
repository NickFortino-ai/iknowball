-- Track when a hot take's Cloudflare Stream video finishes transcoding so we
-- can hide processing videos from public feeds until they're actually
-- playable. Uploader sees a "processing" state on their own pending posts;
-- everyone else only sees posts once stream_ready_at is set.
--
-- Non-video posts get stream_ready_at = NOW() at create time so the feed
-- filter (stream_video_uid IS NULL OR stream_ready_at IS NOT NULL) still
-- surfaces them.
ALTER TABLE hot_takes
  ADD COLUMN IF NOT EXISTS stream_ready_at timestamptz;

-- Backfill existing rows: everything already created either has no video
-- or was uploaded to Supabase storage (pre-Cloudflare-Stream migration).
-- Both cases are "ready" and should stay visible.
UPDATE hot_takes SET stream_ready_at = COALESCE(created_at, NOW()) WHERE stream_ready_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hot_takes_stream_pending
  ON hot_takes(stream_video_uid)
  WHERE stream_video_uid IS NOT NULL AND stream_ready_at IS NULL;
