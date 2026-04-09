-- Atomic NFL player_id merge. Used by admin to recover from a Sleeper
-- player renumber (rare, ~once or twice a season). Migrates every foreign
-- key reference from old_id to new_id, handling UNIQUE-constraint
-- conflicts by preferring the row that already uses new_id, then drops
-- the orphaned old nfl_players row.
--
-- All work happens inside a single function call, which Postgres treats as
-- one transaction. If anything fails partway through, every change is
-- rolled back.

CREATE OR REPLACE FUNCTION merge_nfl_player_id(p_old_id TEXT, p_new_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_exists BOOLEAN;
  v_new_exists BOOLEAN;
  v_counts JSONB := '{}'::jsonb;
  v_n INT;
BEGIN
  IF p_old_id IS NULL OR p_new_id IS NULL THEN
    RAISE EXCEPTION 'Both old_id and new_id are required';
  END IF;
  IF p_old_id = p_new_id THEN
    RAISE EXCEPTION 'old_id and new_id are the same';
  END IF;

  SELECT EXISTS (SELECT 1 FROM nfl_players WHERE id = p_old_id) INTO v_old_exists;
  SELECT EXISTS (SELECT 1 FROM nfl_players WHERE id = p_new_id) INTO v_new_exists;
  IF NOT v_old_exists THEN
    RAISE EXCEPTION 'old_id % does not exist in nfl_players', p_old_id;
  END IF;
  IF NOT v_new_exists THEN
    RAISE EXCEPTION 'new_id % does not exist in nfl_players', p_new_id;
  END IF;

  -- nfl_player_stats: UNIQUE(player_id, season, week)
  -- Delete old rows where the new id already has stats for the same week
  DELETE FROM nfl_player_stats s
   WHERE s.player_id = p_old_id
     AND EXISTS (SELECT 1 FROM nfl_player_stats s2
                  WHERE s2.player_id = p_new_id
                    AND s2.season = s.season
                    AND s2.week = s.week);
  UPDATE nfl_player_stats SET player_id = p_new_id WHERE player_id = p_old_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('nfl_player_stats', v_n);

  -- fantasy_rosters: UNIQUE(league_id, player_id)
  DELETE FROM fantasy_rosters r
   WHERE r.player_id = p_old_id
     AND EXISTS (SELECT 1 FROM fantasy_rosters r2
                  WHERE r2.player_id = p_new_id AND r2.league_id = r.league_id);
  UPDATE fantasy_rosters SET player_id = p_new_id WHERE player_id = p_old_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('fantasy_rosters', v_n);

  -- fantasy_draft_picks: no UNIQUE on player_id, plain update
  UPDATE fantasy_draft_picks SET player_id = p_new_id WHERE player_id = p_old_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('fantasy_draft_picks', v_n);

  -- fantasy_waiver_claims: no UNIQUE, two columns
  UPDATE fantasy_waiver_claims SET add_player_id = p_new_id WHERE add_player_id = p_old_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('fantasy_waiver_claims_add', v_n);
  UPDATE fantasy_waiver_claims SET drop_player_id = p_new_id WHERE drop_player_id = p_old_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('fantasy_waiver_claims_drop', v_n);

  -- fantasy_waiver_pool: PK (league_id, player_id)
  DELETE FROM fantasy_waiver_pool p
   WHERE p.player_id = p_old_id
     AND EXISTS (SELECT 1 FROM fantasy_waiver_pool p2
                  WHERE p2.player_id = p_new_id AND p2.league_id = p.league_id);
  UPDATE fantasy_waiver_pool SET player_id = p_new_id WHERE player_id = p_old_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('fantasy_waiver_pool', v_n);

  -- fantasy_draft_queue: typically UNIQUE(league_id, user_id, player_id)
  -- Use IF EXISTS guard since this table is post-MVP
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fantasy_draft_queue') THEN
    DELETE FROM fantasy_draft_queue q
     WHERE q.player_id = p_old_id
       AND EXISTS (SELECT 1 FROM fantasy_draft_queue q2
                    WHERE q2.player_id = p_new_id
                      AND q2.league_id = q.league_id
                      AND q2.user_id = q.user_id);
    UPDATE fantasy_draft_queue SET player_id = p_new_id WHERE player_id = p_old_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fantasy_draft_queue', v_n);
  END IF;

  -- fantasy_user_rankings: UNIQUE(league_id, user_id, player_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fantasy_user_rankings') THEN
    DELETE FROM fantasy_user_rankings r
     WHERE r.player_id = p_old_id
       AND EXISTS (SELECT 1 FROM fantasy_user_rankings r2
                    WHERE r2.player_id = p_new_id
                      AND r2.league_id = r.league_id
                      AND r2.user_id = r.user_id);
    UPDATE fantasy_user_rankings SET player_id = p_new_id WHERE player_id = p_old_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fantasy_user_rankings', v_n);
  END IF;

  -- fantasy_trade_items: no unique on player_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fantasy_trade_items') THEN
    UPDATE fantasy_trade_items SET player_id = p_new_id WHERE player_id = p_old_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fantasy_trade_items', v_n);
  END IF;

  -- td_pass_picks: UNIQUE(league_id, user_id, qb_player_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'td_pass_picks') THEN
    DELETE FROM td_pass_picks t
     WHERE t.qb_player_id = p_old_id
       AND EXISTS (SELECT 1 FROM td_pass_picks t2
                    WHERE t2.qb_player_id = p_new_id
                      AND t2.league_id = t.league_id
                      AND t2.user_id = t.user_id);
    UPDATE td_pass_picks SET qb_player_id = p_new_id WHERE qb_player_id = p_old_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('td_pass_picks', v_n);
  END IF;

  -- dfs_roster_slots: no UNIQUE on player_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dfs_roster_slots') THEN
    UPDATE dfs_roster_slots SET player_id = p_new_id WHERE player_id = p_old_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('dfs_roster_slots', v_n);
  END IF;

  -- dfs_weekly_salaries / nfl_player_salaries: typically UNIQUE(week, season, player_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dfs_weekly_salaries') THEN
    DELETE FROM dfs_weekly_salaries s
     WHERE s.player_id = p_old_id
       AND EXISTS (SELECT 1 FROM dfs_weekly_salaries s2
                    WHERE s2.player_id = p_new_id
                      AND s2.week = s.week
                      AND s2.season = s.season);
    UPDATE dfs_weekly_salaries SET player_id = p_new_id WHERE player_id = p_old_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('dfs_weekly_salaries', v_n);
  END IF;

  -- Finally, delete the orphaned old nfl_players row
  DELETE FROM nfl_players WHERE id = p_old_id;

  RETURN jsonb_build_object('ok', true, 'old_id', p_old_id, 'new_id', p_new_id, 'updated', v_counts);
END;
$$;
