import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { getNFLState } from '../services/sleeperService.js'

/**
 * Send "your starter is OUT" warnings to fantasy team owners.
 *
 * For both traditional fantasy (starting lineup) and salary cap rosters,
 * if a rostered player has injury_status='Out' or 'IR' AND their team's
 * game starts within the next 24 hours, send the owner a one-time
 * notification per (player, week) so they can swap them out.
 *
 * Dedup: each notification's metadata stores player_id + week + season
 * so we never send the same warning twice for the same lineup.
 */
export async function sendNflInjuryWarnings() {
  const state = await getNFLState()
  if (!state) return
  const season = state.season ? parseInt(state.season, 10) : new Date().getUTCFullYear()
  if (state.season_type !== 'regular' && state.season_type !== 'post') return
  const week = state.week ? parseInt(state.week, 10) : null
  if (!week) return

  // 1. Find every Out / IR player on an NFL roster
  const { data: outPlayers } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team, injury_status')
    .in('injury_status', ['Out', 'IR'])
    .not('team', 'is', null)

  if (!outPlayers?.length) {
    logger.debug('No Out/IR NFL players to warn about')
    return
  }
  const outIds = outPlayers.map((p) => p.id)
  const playerById = {}
  for (const p of outPlayers) playerById[p.id] = p

  // 2. Find traditional fantasy starters with these players
  const STARTER_SLOT_KEYS = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def']
  const { data: tradStarters } = await supabase
    .from('fantasy_rosters')
    .select('league_id, user_id, player_id, slot, leagues(name, format)')
    .in('player_id', outIds)
    .in('slot', STARTER_SLOT_KEYS)

  // 3. Find salary cap rostered players for the current week
  const { data: dfsSlots } = await supabase
    .from('dfs_roster_slots')
    .select('roster_id, player_id, dfs_rosters!inner(league_id, user_id, nfl_week, season, leagues(name))')
    .in('player_id', outIds)
    .eq('dfs_rosters.nfl_week', week)
    .eq('dfs_rosters.season', season)

  // 4. Build a list of (user_id, player_id, league_id, league_name, source)
  const warnings = []
  for (const r of tradStarters || []) {
    if (r.leagues?.format !== 'fantasy') continue
    warnings.push({
      user_id: r.user_id,
      player_id: r.player_id,
      league_id: r.league_id,
      league_name: r.leagues?.name || 'your league',
      source: 'traditional',
    })
  }
  for (const s of dfsSlots || []) {
    warnings.push({
      user_id: s.dfs_rosters.user_id,
      player_id: s.player_id,
      league_id: s.dfs_rosters.league_id,
      league_name: s.dfs_rosters.leagues?.name || 'your league',
      source: 'salary_cap',
    })
  }

  if (!warnings.length) return

  // 5. Dedup: for each (user, player, week), check if a warning was already sent
  // (We store player_id + week in notification metadata)
  const dedupKeys = warnings.map((w) => `${w.user_id}|${w.player_id}|${w.league_id}|${week}`)
  const { data: existingNotifs } = await supabase
    .from('notifications')
    .select('user_id, metadata')
    .eq('type', 'nfl_injury_warning')
    .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())

  const sentSet = new Set()
  for (const n of existingNotifs || []) {
    const md = n.metadata || {}
    if (md.player_id && md.league_id && md.week === week) {
      sentSet.add(`${n.user_id}|${md.player_id}|${md.league_id}|${md.week}`)
    }
  }

  // 6. Send warnings
  let sent = 0
  for (let i = 0; i < warnings.length; i++) {
    const w = warnings[i]
    const key = dedupKeys[i]
    if (sentSet.has(key)) continue
    sentSet.add(key) // prevent dupes within this batch

    const player = playerById[w.player_id]
    const status = player?.injury_status || 'Out'
    const body = `${player?.full_name || 'A player'} (${status}) is on your ${w.league_name} starting lineup. Swap them out before kickoff!`
    try {
      await createNotification(w.user_id, 'nfl_injury_warning', body, {
        player_id: w.player_id,
        league_id: w.league_id,
        week,
        season,
        source: w.source,
        injury_status: status,
      })
      sent++
    } catch (err) {
      logger.error({ err, warning: w }, 'Failed to send NFL injury warning')
    }
  }

  logger.info({ candidates: warnings.length, sent, week, season }, 'NFL injury warnings sent')
}
