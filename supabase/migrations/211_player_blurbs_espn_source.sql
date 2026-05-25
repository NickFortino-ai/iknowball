-- Allow ESPN as a third blurb source alongside manual and AI. ESPN-sourced
-- blurbs are written automatically by syncInjuries when ESPN ships rich
-- injury prose (shortComment / longComment), and also when the depth-chart
-- cross-reference detects a cleared-to-play transition. These rows skip the
-- draft → publish dance and land as status='published' immediately.

ALTER TABLE player_blurbs
  DROP CONSTRAINT IF EXISTS player_blurbs_generated_by_check;

ALTER TABLE player_blurbs
  ADD CONSTRAINT player_blurbs_generated_by_check
  CHECK (generated_by IN ('ai', 'manual', 'espn'));
