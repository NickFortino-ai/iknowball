-- Fix account deletion for users with any invitation / connection /
-- backdrop-submission / squares-winner / app-settings history.
--
-- Before this migration, 5 FK constraints referenced users(id) without
-- ON DELETE behavior specified, so Postgres defaulted to NO ACTION —
-- which blocked auth.admin.deleteUser() with "Database error deleting"
-- for any user who'd ever received an invitation (or left any of the
-- other traces below). App Store guideline 5.1.1 requires working
-- account deletion; this closes the hole.
--
-- Rules of thumb:
--   NOT NULL column  → CASCADE (row is meaningfully owned by the user)
--   Nullable column  → SET NULL (audit trail — preserve the record, lose
--                                the ghost pointer)

-- league_invitations: both invited_by and invited_user_id are NOT NULL,
-- so an invitation without either party is nonsensical. Cascade delete.
ALTER TABLE league_invitations
  DROP CONSTRAINT IF EXISTS league_invitations_invited_by_fkey,
  ADD CONSTRAINT league_invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE league_invitations
  DROP CONSTRAINT IF EXISTS league_invitations_invited_user_id_fkey,
  ADD CONSTRAINT league_invitations_invited_user_id_fkey
    FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- squares_boards q_winner_id: nullable audit trail. If the winner deletes
-- their account, we still remember "quarter had a winner" without a
-- dangling ghost pointer.
ALTER TABLE squares_boards
  DROP CONSTRAINT IF EXISTS squares_boards_q1_winner_id_fkey,
  ADD CONSTRAINT squares_boards_q1_winner_id_fkey
    FOREIGN KEY (q1_winner_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE squares_boards
  DROP CONSTRAINT IF EXISTS squares_boards_q2_winner_id_fkey,
  ADD CONSTRAINT squares_boards_q2_winner_id_fkey
    FOREIGN KEY (q2_winner_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE squares_boards
  DROP CONSTRAINT IF EXISTS squares_boards_q3_winner_id_fkey,
  ADD CONSTRAINT squares_boards_q3_winner_id_fkey
    FOREIGN KEY (q3_winner_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE squares_boards
  DROP CONSTRAINT IF EXISTS squares_boards_q4_winner_id_fkey,
  ADD CONSTRAINT squares_boards_q4_winner_id_fkey
    FOREIGN KEY (q4_winner_id) REFERENCES users(id) ON DELETE SET NULL;

-- connections.requested_by: nullable. user_id_1 / user_id_2 already
-- CASCADE, so the connection row itself dies with either party. We just
-- need to make sure the audit-trail pointer doesn't block.
ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_requested_by_fkey,
  ADD CONSTRAINT connections_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;

-- backdrop_submissions.user_id: NOT NULL, the submission belongs to
-- them. Cascade. reviewed_by is nullable — set null so the submission
-- record survives.
ALTER TABLE backdrop_submissions
  DROP CONSTRAINT IF EXISTS backdrop_submissions_user_id_fkey,
  ADD CONSTRAINT backdrop_submissions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE backdrop_submissions
  DROP CONSTRAINT IF EXISTS backdrop_submissions_reviewed_by_fkey,
  ADD CONSTRAINT backdrop_submissions_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- app_settings.updated_by: nullable audit. Set null so an admin
-- deleting their account doesn't orphan a settings row.
ALTER TABLE app_settings
  DROP CONSTRAINT IF EXISTS app_settings_updated_by_fkey,
  ADD CONSTRAINT app_settings_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
