-- Cloudflare Stream integration for hot take videos. video_url still holds
-- the HLS manifest URL for playback (backwards compatible with the render
-- code); the new stream_video_uid stores Cloudflare's asset ID so we can
-- (a) reference it for future admin cleanup / analytics, and (b) detect
-- Cloudflare-hosted videos separately from any legacy Supabase-hosted ones.
ALTER TABLE hot_takes
  ADD COLUMN IF NOT EXISTS stream_video_uid text;

CREATE INDEX IF NOT EXISTS idx_hot_takes_stream_video_uid ON hot_takes(stream_video_uid) WHERE stream_video_uid IS NOT NULL;
