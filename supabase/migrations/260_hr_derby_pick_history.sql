-- HR Derby pick audit trail.
--
-- Every UPDATE that changes hr_derby_picks.home_runs writes a row here
-- with (prev, new, timestamp). Purpose: post-mortem when a user's HR
-- total drops unexpectedly. The scoring cron overwrites home_runs on
-- every run and there's no other log, so a "yesterday I had 61, today
-- I have 59" report is otherwise impossible to trace.
--
-- Trigger-based (not code-based) so it catches every write path,
-- including any we haven't traced. If something outside
-- scoreHRDerbyPicks mutates the column, it still ends up here.

CREATE TABLE IF NOT EXISTS hr_derby_pick_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id UUID NOT NULL REFERENCES hr_derby_picks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  espn_player_id TEXT,
  player_name TEXT,
  game_date DATE NOT NULL,
  prev_home_runs INTEGER,
  new_home_runs INTEGER,
  delta INTEGER,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hr_derby_history_user_date
  ON hr_derby_pick_history(user_id, game_date DESC);
CREATE INDEX idx_hr_derby_history_pick
  ON hr_derby_pick_history(pick_id, changed_at DESC);
CREATE INDEX idx_hr_derby_history_decreases
  ON hr_derby_pick_history(changed_at DESC)
  WHERE delta < 0;

-- Data API grants (post-2026-10-30 auto-grant cutover — manual grants
-- required for the anon/authenticated roles to see this via PostgREST,
-- though we'll query directly via Supabase Studio for now).
GRANT SELECT ON hr_derby_pick_history TO authenticated;

-- Trigger function: fires on UPDATE only when home_runs actually changed.
CREATE OR REPLACE FUNCTION log_hr_derby_pick_hr_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.home_runs IS DISTINCT FROM OLD.home_runs THEN
    INSERT INTO hr_derby_pick_history
      (pick_id, user_id, league_id, espn_player_id, player_name,
       game_date, prev_home_runs, new_home_runs, delta)
    VALUES
      (NEW.id, NEW.user_id, NEW.league_id, NEW.espn_player_id, NEW.player_name,
       NEW.game_date, OLD.home_runs, NEW.home_runs,
       COALESCE(NEW.home_runs, 0) - COALESCE(OLD.home_runs, 0));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hr_derby_pick_hr_change ON hr_derby_picks;
CREATE TRIGGER trg_hr_derby_pick_hr_change
  AFTER UPDATE OF home_runs ON hr_derby_picks
  FOR EACH ROW
  EXECUTE FUNCTION log_hr_derby_pick_hr_change();
