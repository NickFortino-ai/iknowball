-- Allow image-only league_messages rows. Migration 088 required
-- char_length(content) BETWEEN 1 AND 2000, which rejects the empty
-- string leagueThreadService inserts for pure-image posts. Migration
-- 242 added image_url + image_urls but didn't relax this constraint.
--
-- New rule: content may be empty when at least one image is attached.
-- Still upper-bounded at 2000 chars. Rows must have either text or an
-- image (blank content + no image is rejected).

ALTER TABLE league_messages
  DROP CONSTRAINT IF EXISTS league_messages_content_check;

ALTER TABLE league_messages
  ADD CONSTRAINT league_messages_content_check
  CHECK (
    char_length(content) BETWEEN 0 AND 2000
    AND (char_length(content) > 0 OR image_url IS NOT NULL)
  );
