import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { getCurrentNflWeek } from '../services/tdPassService.js'

// Reusing nfl_injury_warning as the notification type so we don't need a
// migration to add a new type. Body text describes the actual sport/format.
const NOTIF_TYPE = 'nfl_injury_warning'

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/**
 * Send "your picked player is OUT" warnings across pick-based contest formats:
 *   3-Point Contest, HR Derby, Strikeouts (NBA/MLB - keyed by espn_player_id + game_date)
 *   Sacks, Interceptions, Passing TD (NFL - keyed by sleeper player id + week)
 *
 * Dedupe: per (user_id, player_key, league_id, period_key). period_key is the
 * game_date for daily formats, or season-week for NFL.
 */
export async function sendPickInjuryWarnings() {
  const today = todayET()

  // Pull recent existing warnings (last 14 days) once so each format can
  // build its dedupe set against it.
  const { data: existingNotifs } = await supabase
    .from('notifications')
    .select('user_id, metadata')
    .eq('type', NOTIF_TYPE)
    .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())

  const sentSet = new Set()
  for (const n of existingNotifs || []) {
    const md = n.metadata || {}
    if (md.player_key && md.league_id && md.period_key) {
      sentSet.add(`${n.user_id}|${md.player_key}|${md.league_id}|${md.period_key}`)
    }
  }

  let sentTotal = 0

  // ── NBA 3-Point Contest ────────────────────────────────────────────
  sentTotal += await runDailyEspnFormat({
    table: 'three_point_picks',
    salaryTable: 'nba_dfs_salaries',
    label: '3-Point Contest',
    statName: 'threes',
    today,
    sentSet,
  })

  // ── MLB HR Derby ──────────────────────────────────────────────────
  sentTotal += await runDailyEspnFormat({
    table: 'hr_derby_picks',
    salaryTable: 'mlb_dfs_salaries',
    label: 'HR Derby',
    statName: 'home runs',
    today,
    sentSet,
  })

  // ── MLB Strikeouts ────────────────────────────────────────────────
  sentTotal += await runDailyEspnFormat({
    table: 'strikeouts_picks',
    salaryTable: 'mlb_dfs_salaries',
    label: 'Strikeouts Contest',
    statName: 'strikeouts',
    today,
    sentSet,
  })

  // ── NBA DFS rosters ──────────────────────────────────────────────
  sentTotal += await runDfsRosterFormat({
    rosterTable: 'nba_dfs_rosters',
    slotTable: 'nba_dfs_roster_slots',
    salaryTable: 'nba_dfs_salaries',
    label: 'NBA DFS',
    today,
    sentSet,
  })

  // ── MLB DFS rosters ──────────────────────────────────────────────
  sentTotal += await runDfsRosterFormat({
    rosterTable: 'mlb_dfs_rosters',
    slotTable: 'mlb_dfs_roster_slots',
    salaryTable: 'mlb_dfs_salaries',
    label: 'MLB DFS',
    today,
    sentSet,
  })

  // ── NFL weekly: Sacks, Interceptions, Passing TD ──────────────────
  try {
    const state = await getCurrentNflWeek()
    if (state?.week && state?.season) {
      sentTotal += await runWeeklyNflFormat({
        table: 'sacks_picks',
        playerKey: 'sleeper_player_id',
        label: 'Sacks Contest',
        season: state.season,
        week: state.week,
        sentSet,
      })
      sentTotal += await runWeeklyNflFormat({
        table: 'ints_picks',
        playerKey: 'sleeper_player_id',
        label: 'Interceptions Contest',
        season: state.season,
        week: state.week,
        sentSet,
      })
      sentTotal += await runWeeklyNflFormat({
        table: 'td_pass_picks',
        playerKey: 'qb_player_id',
        label: 'Passing TD Competition',
        season: state.season,
        week: state.week,
        sentSet,
      })
    }
  } catch (err) {
    logger.error({ err }, 'NFL pick injury warnings failed')
  }

  if (sentTotal > 0) logger.info({ sent: sentTotal }, 'Pick injury warnings sent')
}

async function runDailyEspnFormat({ table, salaryTable, label, statName, today, sentSet }) {
  // Find Out players in today's salaries
  const { data: outSalaries } = await supabase
    .from(salaryTable)
    .select('espn_player_id, player_name')
    .eq('game_date', today)
    .eq('injury_status', 'Out')

  if (!outSalaries?.length) return 0
  const outIds = outSalaries.map((s) => s.espn_player_id).filter(Boolean)
  if (!outIds.length) return 0
  const nameById = {}
  for (const s of outSalaries) nameById[s.espn_player_id] = s.player_name

  // Find picks of those players for today
  const { data: picks } = await supabase
    .from(table)
    .select('user_id, league_id, espn_player_id, leagues(name)')
    .eq('game_date', today)
    .in('espn_player_id', outIds)

  if (!picks?.length) return 0

  let sent = 0
  for (const p of picks) {
    const periodKey = `date:${today}`
    const playerKey = `espn:${p.espn_player_id}`
    const dedupKey = `${p.user_id}|${playerKey}|${p.league_id}|${periodKey}`
    if (sentSet.has(dedupKey)) continue
    sentSet.add(dedupKey)

    const playerName = nameById[p.espn_player_id] || 'A player'
    const leagueName = p.leagues?.name || `your ${label}`
    const body = `${playerName} is Out tonight — they're on your ${leagueName} lineup. Swap them out before the game starts to avoid a 0 ${statName} contribution.`
    try {
      await createNotification(p.user_id, NOTIF_TYPE, body, {
        player_key: playerKey,
        league_id: p.league_id,
        period_key: periodKey,
        format: label,
      })
      sent++
    } catch (err) {
      logger.error({ err, p }, `${label} injury warning failed`)
    }
  }
  return sent
}

async function runDfsRosterFormat({ rosterTable, slotTable, salaryTable, label, today, sentSet }) {
  // Find Out players in today's salaries
  const { data: outSalaries } = await supabase
    .from(salaryTable)
    .select('espn_player_id, player_name')
    .eq('game_date', today)
    .eq('injury_status', 'Out')

  if (!outSalaries?.length) return 0
  const outIds = outSalaries.map((s) => s.espn_player_id).filter(Boolean)
  if (!outIds.length) return 0
  const nameById = {}
  for (const s of outSalaries) nameById[s.espn_player_id] = s.player_name

  // Find roster slots holding those players for today's rosters
  const { data: slots } = await supabase
    .from(slotTable)
    .select(`espn_player_id, ${rosterTable}!inner(league_id, user_id, game_date, leagues(name))`)
    .in('espn_player_id', outIds)
    .eq(`${rosterTable}.game_date`, today)

  if (!slots?.length) return 0

  let sent = 0
  for (const slot of slots) {
    const roster = slot[rosterTable]
    if (!roster) continue
    const periodKey = `date:${today}`
    const playerKey = `espn:${slot.espn_player_id}`
    const dedupKey = `${roster.user_id}|${playerKey}|${roster.league_id}|${periodKey}`
    if (sentSet.has(dedupKey)) continue
    sentSet.add(dedupKey)

    const playerName = nameById[slot.espn_player_id] || 'A player'
    const leagueName = roster.leagues?.name || `your ${label}`
    const body = `${playerName} is Out tonight — they're on your ${leagueName} ${label} roster. Swap them out before the game starts.`
    try {
      await createNotification(roster.user_id, NOTIF_TYPE, body, {
        player_key: playerKey,
        league_id: roster.league_id,
        period_key: periodKey,
        format: label,
      })
      sent++
    } catch (err) {
      logger.error({ err, slot }, `${label} injury warning failed`)
    }
  }
  return sent
}

async function runWeeklyNflFormat({ table, playerKey, label, season, week, sentSet }) {
  // Find Out NFL players
  const { data: outPlayers } = await supabase
    .from('nfl_players')
    .select('id, full_name, injury_status')
    .in('injury_status', ['Out', 'IR'])
    .not('team', 'is', null)

  if (!outPlayers?.length) return 0
  const outIds = outPlayers.map((p) => p.id)
  const nameById = {}
  for (const p of outPlayers) nameById[p.id] = { name: p.full_name, status: p.injury_status }

  const { data: picks } = await supabase
    .from(table)
    .select(`user_id, league_id, ${playerKey}, leagues(name)`)
    .eq('season', season)
    .eq('week', week)
    .in(playerKey, outIds)

  if (!picks?.length) return 0

  let sent = 0
  for (const p of picks) {
    const playerId = p[playerKey]
    const periodKey = `wk:${season}:${week}`
    const dedupPlayerKey = `nfl:${playerId}`
    const dedupKey = `${p.user_id}|${dedupPlayerKey}|${p.league_id}|${periodKey}`
    if (sentSet.has(dedupKey)) continue
    sentSet.add(dedupKey)

    const meta = nameById[playerId] || { name: 'A player', status: 'Out' }
    const leagueName = p.leagues?.name || `your ${label}`
    const body = `${meta.name} (${meta.status}) is on your ${leagueName} pick this week. Swap them out before kickoff.`
    try {
      await createNotification(p.user_id, NOTIF_TYPE, body, {
        player_key: dedupPlayerKey,
        league_id: p.league_id,
        period_key: periodKey,
        format: label,
      })
      sent++
    } catch (err) {
      logger.error({ err, p }, `${label} injury warning failed`)
    }
  }
  return sent
}
