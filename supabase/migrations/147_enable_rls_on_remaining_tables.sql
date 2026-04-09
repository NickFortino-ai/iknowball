-- Lock down every table that the Supabase database linter flagged as
-- "RLS Disabled in Public" (advisor lint 0013_rls_disabled_in_public).
--
-- SAFETY MODEL
-- ============
-- The IKB browser client never calls supabase.from(...) directly. Every DB
-- read/write goes through the Express API, which uses the service_key — and
-- the service_key bypasses RLS by design. So enabling RLS without permissive
-- policies on these tables:
--   - Blocks all anon-key access (closes the audit findings) ✓
--   - Has zero impact on the API server (service_key still bypasses RLS) ✓
--   - Is verified safe because no client component calls .from() on these
--     tables today.
--
-- The ONE exception is `fantasy_draft_picks`, which is consumed via Supabase
-- Realtime postgres_changes from the browser. Realtime delivers events to
-- authenticated clients only if their role could SELECT the row, so we add
-- an explicit "league members can SELECT" policy. Without it, drafts would
-- silently stop updating live for everyone.
--
-- Every ENABLE ROW LEVEL SECURITY statement is idempotent — running it on a
-- table that already has RLS enabled is a no-op, so this migration is safe
-- to apply even if some of these tables are already locked down.

BEGIN;

-- ============================================================
-- Tables locked down with NO policies (server-only access)
-- ============================================================
ALTER TABLE IF EXISTS league_thread_reads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS weekly_recaps           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS league_invitations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bonus_points            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fantasy_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS banned_words            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fantasy_rosters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nfl_players             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dfs_roster_slots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS league_picks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS email_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crown_snapshots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nfl_schedule            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nfl_player_stats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fantasy_matchups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fantasy_waiver_claims   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dfs_weekly_salaries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dfs_rosters             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dfs_weekly_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nba_dfs_rosters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nba_dfs_roster_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nba_dfs_player_stats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nba_dfs_nightly_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nba_dfs_salaries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS backdrop_submissions    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- fantasy_draft_picks: needs RLS + a SELECT policy because the browser
-- subscribes via Supabase Realtime postgres_changes for live drafts.
-- Without a policy, authenticated clients couldn't see new pick events
-- and the draft room would appear frozen.
-- ============================================================
ALTER TABLE IF EXISTS fantasy_draft_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "League members can read draft picks" ON fantasy_draft_picks;
CREATE POLICY "League members can read draft picks" ON fantasy_draft_picks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = fantasy_draft_picks.league_id
        AND league_members.user_id = auth.uid()
    )
  );

COMMIT;
