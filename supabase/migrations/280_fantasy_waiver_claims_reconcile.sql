-- Reconcile fantasy_waiver_claims with the shape the code has always assumed.
--
-- Migration 092 created this table with `faab_bid` / `priority` / `week` and a
-- status CHECK of (pending, approved, rejected, cancelled).
--
-- Migration 133 rewrote the FAAB waiver system and redeclared the table with
-- `bid_amount` / `fail_reason` / `processed_at` and a status CHECK of
-- (pending, awarded, failed, cancelled) -- but it used CREATE TABLE IF NOT
-- EXISTS. The table already existed, so that statement was a silent no-op and
-- not one of the new columns ever landed. The rest of 133 (indexes, RLS, the
-- notifications type constraint) did run, which is why nothing looked wrong.
--
-- Result: submitting a waiver claim has been impossible since 133 shipped --
-- "Could not find the 'bid_amount' column of 'fantasy_waiver_claims' in the
-- schema cache". The table is empty, confirming no claim has ever succeeded.
--
-- Three separate breakages, all of which have to be fixed together or the
-- insert just fails on the next one down:
--   1. bid_amount / fail_reason / processed_at don't exist
--   2. week is NOT NULL and the insert never supplies it
--   3. the status CHECK rejects 'awarded' and 'failed', which is what the
--      Wednesday processor writes

ALTER TABLE fantasy_waiver_claims ADD COLUMN IF NOT EXISTS bid_amount INTEGER DEFAULT 0;
ALTER TABLE fantasy_waiver_claims ADD COLUMN IF NOT EXISTS fail_reason TEXT;
ALTER TABLE fantasy_waiver_claims ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- 133's design has no week column; claims are processed by status, not week.
-- Kept rather than dropped so nothing referencing it breaks, but it can no
-- longer block an insert.
ALTER TABLE fantasy_waiver_claims ALTER COLUMN week DROP NOT NULL;

-- The other two 092 leftovers, faab_bid and priority, are already nullable and
-- referenced by no code path, so they need nothing here. Note in particular
-- that priority waivers do NOT read this table's `priority` column -- the
-- processor orders claims by fantasy_waiver_state.priority.

-- The processor writes 'awarded' and 'failed'; 092's constraint allows neither.
ALTER TABLE fantasy_waiver_claims DROP CONSTRAINT IF EXISTS fantasy_waiver_claims_status_check;
ALTER TABLE fantasy_waiver_claims ADD CONSTRAINT fantasy_waiver_claims_status_check
  CHECK (status IN ('pending', 'awarded', 'failed', 'cancelled'));

ALTER TABLE fantasy_waiver_claims ALTER COLUMN status SET DEFAULT 'pending';

-- Indexes 133 intended (these did run, but IF NOT EXISTS keeps this re-runnable).
CREATE INDEX IF NOT EXISTS idx_fantasy_waiver_claims_league ON fantasy_waiver_claims(league_id, status);
CREATE INDEX IF NOT EXISTS idx_fantasy_waiver_claims_user ON fantasy_waiver_claims(user_id, status);
