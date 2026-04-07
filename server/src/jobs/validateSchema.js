import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Boot-time smoke check: hits every critical Supabase query the fantasy
 * stack depends on with LIMIT 0. Catches column-name typos and missing
 * tables at startup so they show up in deploy logs immediately rather
 * than the first time a user hits the feature.
 *
 * Each entry: { name, fn } — fn must throw on failure.
 */
const CHECKS = [
  {
    name: 'nfl_players projection columns',
    fn: () => supabase.from('nfl_players')
      .select('id, full_name, position, team, headshot_url, search_rank, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std')
      .limit(0),
  },
  {
    name: 'fantasy_settings core',
    fn: () => supabase.from('fantasy_settings')
      .select('league_id, num_teams, scoring_format, scoring_rules, roster_slots, draft_status, draft_started_at, draft_resumed_at, draft_pre_start_notified_at, draft_pick_timer, draft_order, draft_date')
      .limit(0),
  },
  {
    name: 'fantasy_draft_picks',
    fn: () => supabase.from('fantasy_draft_picks')
      .select('id, league_id, user_id, player_id, pick_number, round, picked_at, is_auto_pick')
      .limit(0),
  },
  {
    name: 'fantasy_rosters',
    fn: () => supabase.from('fantasy_rosters')
      .select('id, league_id, user_id, player_id, slot, acquired_via')
      .limit(0),
  },
  {
    name: 'fantasy_matchups',
    fn: () => supabase.from('fantasy_matchups')
      .select('id, league_id, week, home_user_id, away_user_id, home_points, away_points, status')
      .limit(0),
  },
  {
    name: 'fantasy_draft_queues',
    fn: () => supabase.from('fantasy_draft_queues')
      .select('id, league_id, user_id, player_id, rank')
      .limit(0),
  },
  {
    name: 'fantasy_user_rankings',
    fn: () => supabase.from('fantasy_user_rankings')
      .select('id, league_id, user_id, player_id, rank')
      .limit(0),
  },
  {
    name: 'fantasy_format_groups',
    fn: () => supabase.from('fantasy_format_groups')
      .select('format_hash, num_teams, scoring_format, roster_slots, scoring_rules, label, league_count, team_count')
      .limit(0),
  },
  {
    name: 'nfl_player_stats (draft modal source)',
    fn: () => supabase.from('nfl_player_stats')
      .select('player_id, season, week, pass_yd, pass_td, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, fgm, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed, pts_ppr, pts_half_ppr, pts_std')
      .limit(0),
  },
  {
    name: 'fantasy_global_rankings',
    fn: () => supabase.from('fantasy_global_rankings')
      .select('id, format_hash, league_id, user_id, total_points, games_played, rank_in_group')
      .limit(0),
  },
]

export async function validateSchema() {
  const failures = []
  for (const check of CHECKS) {
    try {
      const { error } = await check.fn()
      if (error) failures.push({ name: check.name, message: error.message })
    } catch (err) {
      failures.push({ name: check.name, message: err?.message || String(err) })
    }
  }
  if (failures.length) {
    logger.error({ failures }, '⚠️  SCHEMA VALIDATION FAILED — fantasy features may be broken until fixed')
  } else {
    logger.info(`Schema validation OK — ${CHECKS.length} fantasy queries checked`)
  }
  return failures
}
