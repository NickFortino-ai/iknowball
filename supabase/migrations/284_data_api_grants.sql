-- Supabase stops auto-granting Data API access to NEW public tables on
-- 2026-10-30. Existing tables keep their grants, so production is unaffected
-- and nothing here is urgent for the running app.
--
-- What it does break is REPLAY. 76 migrations create tables and only 6 issue
-- a grant, so from Oct 30 a fresh `supabase db reset`, a preview branch, or a
-- new project built from these migrations would produce ~70 tables the Data
-- API cannot reach. That is a disaster-recovery problem, and the cheapest
-- time to fix it is before we need it.
--
-- WHICH ROLE ACTUALLY NEEDS THIS
--
-- Supabase's email suggests granting to anon, authenticated and service_role.
-- We only need service_role:
--
--   - client/src/lib/supabase.js creates an anon client for AUTH ONLY. There
--     are ZERO .from() or .rpc() calls in the whole client — verified, not
--     assumed. The browser never reaches PostgREST for data.
--   - every table read and write goes through Express, which holds
--     SUPABASE_SERVICE_ROLE_KEY (server/src/config/supabase.js).
--
-- So granting anon/authenticated would widen the surface for no caller. RLS
-- would still block them, but the narrower grant matches the posture the rest
-- of the schema already takes.
--
-- Note BYPASSRLS is not a substitute: row-level security and table
-- privileges are separate, so service_role needs the GRANT regardless.
--
-- Idempotent — safe to re-run, and safe to apply now even though production
-- already has these implicitly.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM   pg_tables
    WHERE  schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',
      t.tablename
    );
  END LOOP;
END $$;

-- Sequences too — an INSERT into a table with a serial/identity column fails
-- without USAGE on its sequence, which is a confusing error to debug because
-- the table grant looks correct.
DO $$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT sequencename
    FROM   pg_sequences
    WHERE  schemaname = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', s.sequencename);
  END LOOP;
END $$;

-- Going forward, this covers tables created by LATER migrations in a replay,
-- so a new CREATE TABLE doesn't silently become unreachable if someone
-- forgets. Default privileges apply to objects created after this runs, by
-- the role that runs it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
