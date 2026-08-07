-- Writer role: a scoped delegator that can create/edit/publish player
-- blurbs but has no other admin capability. Independent of is_admin so
-- an admin who is not a writer is unaffected, and a writer never
-- carries is_admin = true (avoids accidentally granting a contractor
-- full admin access).
--
-- Access control lives in server/src/middleware/requireBlurbWriter.js:
-- allows any user with is_admin = true OR is_writer = true.
--
-- Authorship: player_blurbs.written_by records who created a blurb. It
-- is deliberately visible only to admins/writers (via /blurbs/*) — the
-- public /players/:id modal reads through getPublishedBlurbsForPlayer,
-- which selects a fixed field list that does NOT include written_by,
-- so authorship is never surfaced to end users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_writer BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE player_blurbs
  ADD COLUMN IF NOT EXISTS written_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_player_blurbs_written_by
  ON player_blurbs(written_by);
