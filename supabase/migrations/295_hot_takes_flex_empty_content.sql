-- A flex with no commentary could never be posted.
--
-- hot_takes_content_check enforces "must carry SOMETHING" — non-empty text, or
-- an image, or a video. That was written before the flex feature, and a flex
-- carries neither: its payload is the attached pick/parlay/prop, and
-- createFlex inserts `content: content || ''`. So every user who tapped
-- "Flex to Squad" and posted without typing a comment hit:
--
--   new row for relation "hot_takes" violates check constraint
--   "hot_takes_content_check"
--
-- which reached them verbatim as a 500 (see the matching fix in
-- hotTakeService.createFlex). The data shows it exactly: all 4 flexes that
-- have ever succeeded carry text, and 0 carry empty content.
--
-- Rewritten as the full "has any payload" list rather than patched, because
-- the live definition had already drifted from migration 052 (which capped
-- content at 280 — there are 395-char posts live, so it was relaxed in the
-- dashboard and never written down). This definition now matches the client's
-- own zod refine in routes/hotTakes.js plus the three flex targets, and is
-- recorded here so the next reader doesn't have to infer it from the rows.
--
-- COALESCE on array_length is load-bearing: array_length('{}', 1) is NULL,
-- not 0, so a bare `> 0` would evaluate NULL and silently fail the OR.

ALTER TABLE hot_takes DROP CONSTRAINT IF EXISTS hot_takes_content_check;

ALTER TABLE hot_takes ADD CONSTRAINT hot_takes_content_check
  CHECK (
    char_length(content) <= 2000
    AND (
      char_length(content) > 0
      OR image_url IS NOT NULL
      OR COALESCE(array_length(image_urls, 1), 0) > 0
      OR video_url IS NOT NULL
      OR stream_video_uid IS NOT NULL
      OR embed_provider IS NOT NULL
      OR flex_pick_id IS NOT NULL
      OR flex_parlay_id IS NOT NULL
      OR flex_prop_pick_id IS NOT NULL
    )
  );

-- Verify: every existing row must still satisfy it (0 rows expected).
SELECT count(*) AS violating_rows
  FROM hot_takes
 WHERE NOT (
   char_length(content) <= 2000
   AND (
     char_length(content) > 0
     OR image_url IS NOT NULL
     OR COALESCE(array_length(image_urls, 1), 0) > 0
     OR video_url IS NOT NULL
     OR stream_video_uid IS NOT NULL
     OR embed_provider IS NOT NULL
     OR flex_pick_id IS NOT NULL
     OR flex_parlay_id IS NOT NULL
     OR flex_prop_pick_id IS NOT NULL
   )
 );
