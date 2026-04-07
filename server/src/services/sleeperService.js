import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const SLEEPER_BASE = 'https://api.sleeper.app/v1'
const SLEEPER_CDN = 'https://sleepercdn.com/content/nfl/players'
const SLEEPER_STATS = 'https://api.sleeper.com'

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

/**
 * Sync all NFL players from Sleeper's player database.
 * This is a large payload (~5MB) — should be cached and run at most once daily.
 */
export async function syncPlayers() {
  logger.info('Starting NFL player sync from Sleeper')

  let data
  try {
    const res = await fetch(`${SLEEPER_BASE}/players/nfl`)
    if (!res.ok) throw new Error(`Sleeper API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Sleeper players')
    throw err
  }

  const players = Object.entries(data)
    .filter(([_, p]) => p.active && FANTASY_POSITIONS.has(p.position))
    .map(([id, p]) => ({
      id,
      full_name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      first_name: p.first_name || null,
      last_name: p.last_name || null,
      position: p.position,
      team: p.team || null,
      number: p.number || null,
      status: p.status || null,
      age: p.age || null,
      years_exp: p.years_exp ?? null,
      college: p.college || null,
      height: p.height || null,
      weight: p.weight || null,
      injury_status: p.injury_status || null,
      injury_body_part: p.injury_body_part || null,
      depth_chart_position: p.depth_chart_position || null,
      depth_chart_order: p.depth_chart_order || null,
      espn_id: p.espn_id ? String(p.espn_id) : null,
      search_rank: p.search_rank || 9999,
      headshot_url: `${SLEEPER_CDN}/${id}.jpg`,
      last_synced_at: new Date().toISOString(),
    }))

  logger.info({ count: players.length }, 'Parsed players from Sleeper')

  // Batch upsert in chunks of 500
  const CHUNK = 500
  let upserted = 0
  for (let i = 0; i < players.length; i += CHUNK) {
    const chunk = players.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('nfl_players')
      .upsert(chunk, { onConflict: 'id' })

    if (error) {
      logger.error({ error, offset: i }, 'Failed to upsert player chunk')
    } else {
      upserted += chunk.length
    }
  }

  logger.info({ upserted, total: players.length }, 'NFL player sync complete')
  return { upserted, total: players.length }
}

/**
 * Sync NFL schedule for a given season.
 */
export async function syncSchedule(season = 2026) {
  logger.info({ season }, 'Syncing NFL schedule from Sleeper')

  let data
  try {
    const res = await fetch(`${SLEEPER_STATS}/schedule/nfl/regular/${season}`)
    if (!res.ok) throw new Error(`Sleeper schedule API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Sleeper schedule')
    throw err
  }

  if (!Array.isArray(data) || !data.length) {
    logger.warn({ season }, 'No schedule data returned')
    return { synced: 0 }
  }

  const rows = data.map((game) => ({
    season,
    week: game.week,
    home_team: game.home,
    away_team: game.away,
    game_date: game.date || null,
    status: game.status === 'complete' ? 'complete' : 'scheduled',
  }))

  const { error } = await supabase
    .from('nfl_schedule')
    .upsert(rows, { onConflict: 'season,week,home_team' })

  if (error) {
    logger.error({ error }, 'Failed to upsert schedule')
    throw error
  }

  logger.info({ synced: rows.length, season }, 'NFL schedule sync complete')
  return { synced: rows.length }
}

/**
 * Sync weekly player stats from Sleeper.
 */
export async function syncWeeklyStats(season = 2026, week = 1) {
  logger.info({ season, week }, 'Syncing weekly player stats from Sleeper')

  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  const posParams = positions.map((p) => `position[]=${p}`).join('&')

  let data
  try {
    const res = await fetch(`${SLEEPER_STATS}/stats/nfl/${season}/${week}?season_type=regular&${posParams}`)
    if (!res.ok) throw new Error(`Sleeper stats API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Sleeper stats')
    throw err
  }

  if (!Array.isArray(data) || !data.length) {
    logger.warn({ season, week }, 'No stats data returned')
    return { synced: 0 }
  }

  const rows = data
    .filter((s) => s.player_id && s.gms_active > 0)
    .map((s) => ({
      player_id: String(s.player_id),
      season,
      week,
      pass_att: s.pass_att || 0,
      pass_cmp: s.pass_cmp || 0,
      pass_yd: s.pass_yd || 0,
      pass_td: s.pass_td || 0,
      pass_int: s.pass_int || 0,
      rush_att: s.rush_att || 0,
      rush_yd: s.rush_yd || 0,
      rush_td: s.rush_td || 0,
      rec_tgt: s.rec_tgt || 0,
      rec: s.rec || 0,
      rec_yd: s.rec_yd || 0,
      rec_td: s.rec_td || 0,
      fum_lost: s.fum_lost || 0,
      two_pt: s.pass_2pt || 0 + s.rush_2pt || 0 + s.rec_2pt || 0,
      fgm: s.fgm || 0,
      fga: s.fga || 0,
      fgm_0_39: (s.fgm_0_19 || 0) + (s.fgm_20_29 || 0) + (s.fgm_30_39 || 0),
      fgm_40_49: s.fgm_40_49 || 0,
      fgm_50_plus: s.fgm_50_plus || 0,
      xpm: s.xpm || 0,
      xpa: s.xpa || 0,
      def_td: s.def_td || 0,
      def_int: s.int || 0,
      def_sack: s.sack || 0,
      def_fum_rec: s.fum_rec || 0,
      def_safety: s.safe || 0,
      def_pts_allowed: s.pts_allow != null ? s.pts_allow : null,
      pts_ppr: s.pts_ppr || null,
      pts_half_ppr: s.pts_half_ppr || null,
      pts_std: s.pts_std || null,
      updated_at: new Date().toISOString(),
    }))

  // Batch upsert
  const CHUNK = 500
  let upserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('nfl_player_stats')
      .upsert(chunk, { onConflict: 'player_id,season,week' })

    if (error) {
      logger.error({ error, offset: i }, 'Failed to upsert stats chunk')
    } else {
      upserted += chunk.length
    }
  }

  logger.info({ upserted, total: rows.length, season, week }, 'Weekly stats sync complete')

  // After stats are upserted, score every NFL salary cap (DFS) league for this week
  // so dfs_weekly_results / wins / standings stay current.
  try {
    const { scoreNflDfsWeek } = await import('./dfsService.js')
    await scoreNflDfsWeek(week, season)
  } catch (err) {
    logger.error({ err, season, week }, 'NFL DFS weekly scoring failed after stats sync')
  }

  return { upserted, total: rows.length }
}

/**
 * Sync player projections from Sleeper (for draft rankings + ADP).
 */
export async function syncProjections(season = 2026) {
  logger.info({ season }, 'Syncing player projections from Sleeper')

  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  const posParams = positions.map((p) => `position[]=${p}`).join('&')

  let data
  try {
    const res = await fetch(`${SLEEPER_STATS}/projections/nfl/${season}/0?season_type=regular&${posParams}&order_by=adp_half_ppr`)
    if (!res.ok) throw new Error(`Sleeper projections API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Sleeper projections')
    throw err
  }

  if (!Array.isArray(data) || !data.length) {
    logger.warn({ season }, 'No projections data returned')
    return { updated: 0 }
  }

  let updated = 0
  for (const proj of data) {
    if (!proj.player_id) continue
    const { error } = await supabase
      .from('nfl_players')
      .update({
        projected_pts_ppr: proj.stats?.pts_ppr || null,
        projected_pts_half_ppr: proj.stats?.pts_half_ppr || null,
        projected_pts_std: proj.stats?.pts_std || null,
        adp_ppr: proj.stats?.adp_ppr || null,
        adp_half_ppr: proj.stats?.adp_half_ppr || null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', String(proj.player_id))

    if (!error) updated++
  }

  logger.info({ updated, total: data.length, season }, 'Projections sync complete')
  return { updated, total: data.length }
}

/**
 * Get current NFL state (season, week, phase).
 */
export async function getNFLState() {
  try {
    const res = await fetch(`${SLEEPER_BASE}/state/nfl`)
    if (!res.ok) throw new Error(`Sleeper state API returned ${res.status}`)
    return await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch NFL state')
    return null
  }
}

/**
 * Calculate fantasy points for a stat line based on scoring format.
 */
export function calculateFantasyPoints(stats, format = 'half_ppr') {
  let pts = 0

  // Passing
  pts += (stats.pass_yd || 0) * 0.04  // 1 pt per 25 yards
  pts += (stats.pass_td || 0) * 4
  pts += (stats.pass_int || 0) * -2

  // Rushing
  pts += (stats.rush_yd || 0) * 0.1   // 1 pt per 10 yards
  pts += (stats.rush_td || 0) * 6

  // Receiving
  pts += (stats.rec_yd || 0) * 0.1    // 1 pt per 10 yards
  pts += (stats.rec_td || 0) * 6
  if (format === 'ppr') pts += (stats.rec || 0) * 1
  else if (format === 'half_ppr') pts += (stats.rec || 0) * 0.5

  // Misc
  pts += (stats.fum_lost || 0) * -2
  pts += (stats.two_pt || 0) * 2

  // Kicking
  pts += (stats.fgm_0_39 || 0) * 3
  pts += (stats.fgm_40_49 || 0) * 4
  pts += (stats.fgm_50_plus || 0) * 5
  pts += (stats.xpm || 0) * 1

  // Defense
  pts += (stats.def_td || 0) * 6
  pts += (stats.def_int || 0) * 2
  pts += (stats.def_sack || 0) * 1
  pts += (stats.def_fum_rec || 0) * 2
  pts += (stats.def_safety || 0) * 2
  if (stats.def_pts_allowed != null) {
    if (stats.def_pts_allowed === 0) pts += 10
    else if (stats.def_pts_allowed <= 6) pts += 7
    else if (stats.def_pts_allowed <= 13) pts += 4
    else if (stats.def_pts_allowed <= 20) pts += 1
    else if (stats.def_pts_allowed <= 27) pts += 0
    else if (stats.def_pts_allowed <= 34) pts += -1
    else pts += -4
  }

  return Math.round(pts * 100) / 100
}
