-- Add image support to league thread messages. Reuses the existing
-- hot-take-images storage bucket (public read, authenticated write) —
-- see migration 055.
--
-- image_url: first (or only) image URL, matches the same shape hot_takes
-- uses so existing utility renderers stay compatible.
-- image_urls: full array (max 4 enforced client-side + Zod).
ALTER TABLE league_messages
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_urls text[];
