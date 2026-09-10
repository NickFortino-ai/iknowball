import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { getNFLState } from '../services/sleeperService.js'
import { fetchAll } from '../utils/fetchAll.js'
import { isUnavailable } from '../utils/injuryStatus.js'
import { NFL_FULL_TO_ABBR } from '../services/fantasyService.js'

/**
 * Send "your starter is OUT" warnings to fantasy team owners.
 *
 * For both traditional fantasy (starting lineup) and salary cap rosters,
 * if a rostered player has injury_status='Out' or 'IR' AND their team's
 * game has not kicked off yet, send the owner a one-time notification per
 * (player, week) so they can swap them out. (This said "within the next 24
 * hours" for a long time and the code never did that — there is no lower
 * bound, only a check that kickoff has not already passed. Warnings go out as
 * soon as the status flips, which is what you want.)
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

  // 1. Find every unavailable player on an NFL roster.
  //
  // This used to be `.in('injury_status', ['Out', 'IR'])`, which sounds
  // complete and is not: "Out" never appears in nfl_players at all, so it was
  // effectively an IR-only check. PUP, Sus and DNR players — 39 of them with
  // a team as of 2026-09-07 — could sit in a starting lineup all week without
  // their owner ever being warned.
  //
  // Fetched by "has any status" and filtered here rather than widening the
  // .in() list, so a casing change from Sleeper ("SUS" vs "Sus") can't
  // silently reopen the same hole. The definition lives in
  // utils/injuryStatus.js, shared with the projection guards in
  // fantasyService — they must agree about who cannot play.
  //
  // Questionable is deliberately absent: a warning for a player who may well
  // suit up trains people to ignore the notification.

  const statused = await fetchAll(
    supabase
      .from('nfl_players')
      .select('id, full_name, position, team, injury_status')
      .not('injury_status', 'is', null)
      .not('team', 'is', null)
      .order('id')
  )
  const outPlayers = (statused || []).filter((p) => isUnavailable(p.injury_status))

  if (!outPlayers?.length) {
    logger.debug('No unavailable NFL players to warn about')
    return
  }

  // Build team → earliest kickoff (ms) map for this week. Once a team's
  // game has started, a "swap him out" warning is either useless (user
  // missed the pre-game window) or confusing (player got hurt in-game,
  // was healthy at kickoff). Skip those. On bye weeks or when schedule
  // data is missing, kickoffByTeam is null and we fall through to today's
  // behavior (warn regardless).
  const kickoffByTeam = await buildNflKickoffByTeam(season, week)
  const nowMs = Date.now()
  const outIds = outPlayers.map((p) => p.id)
  const playerById = {}
  for (const p of outPlayers) playerById[p.id] = p

  // 2. Find traditional fantasy starters with these players. "Starter"
  // here = anything not bench / IR — config-agnostic so we don't have to
  // enumerate slot keys per league. Orphan slots get demoted to bench
  // upstream by fillEmptyStarterSlots, so they're filtered out here.
  // fetchAll: ~50-200 injured players × many leagues rostering them
  // easily blows past 1000 → truncation means some starters miss the
  // warning entirely.
  const tradRosters = await fetchAll(
    supabase
      .from('fantasy_rosters')
      .select('league_id, user_id, player_id, slot, leagues(name, format)')
      .in('player_id', outIds)
      .order('league_id')
  )
  const tradStarters = tradRosters.filter((r) => {
    const s = (r.slot || '').toLowerCase()
    if (!s) return false
    if (s === 'bench' || s.startsWith('bench')) return false
    if (s === 'ir' || s.startsWith('ir')) return false
    return true
  })

  // 3. Find salary cap rostered players for the current week.
  // fetchAll for the same reason the traditional branch above uses it: this
  // was the one roster query without it, so at enough salary cap leagues the
  // silent 1000-row cap would drop rosters off the end and those owners would
  // never be warned. Cheap insurance — it pages only when there is a page.
  const dfsSlots = await fetchAll(
    supabase
      .from('dfs_roster_slots')
      .select('roster_id, player_id, dfs_rosters!inner(league_id, user_id, nfl_week, season, leagues(name))')
      .in('player_id', outIds)
      .eq('dfs_rosters.nfl_week', week)
      .eq('dfs_rosters.season', season)
      .order('roster_id')
  )

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
  // (We store player_id + week in notification metadata).
  // fetchAll: at scale this table row-count of nfl_injury_warning
  // notifications over 14 days easily exceeds 1000 → truncation means
  // we lose the sent record and fire duplicates.
  const dedupKeys = warnings.map((w) => `${w.user_id}|${w.player_id}|${w.league_id}|${week}`)
  const existingNotifs = await fetchAll(
    supabase
      .from('notifications')
      .select('user_id, metadata, id')
      .eq('type', 'nfl_injury_warning')
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('id')
  )

  const sentSet = new Set()
  for (const n of existingNotifs) {
    const md = n.metadata || {}
    if (md.player_id && md.league_id && md.week === week) {
      sentSet.add(`${n.user_id}|${md.player_id}|${md.league_id}|${md.week}`)
    }
  }

  // 6. Send warnings
  let sent = 0
  let skippedPostKickoff = 0
  for (let i = 0; i < warnings.length; i++) {
    const w = warnings[i]
    const key = dedupKeys[i]
    if (sentSet.has(key)) continue

    const player = playerById[w.player_id]
    // Skip if the player's team has already kicked off — see comment above
    // buildNflKickoffByTeam call.
    if (kickoffByTeam && player?.team) {
      const teamKickoff = kickoffByTeam[player.team]
      if (teamKickoff != null && teamKickoff <= nowMs) {
        skippedPostKickoff++
        continue
      }
    }
    sentSet.add(key) // prevent dupes within this batch

    const status = player?.injury_status || 'Out'
    const body = `${player?.full_name || 'A player'} (${status}) is on your ${w.league_name} starting lineup. Swap him out before kickoff!`
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

  logger.info({ candidates: warnings.length, sent, skippedPostKickoff, week, season }, 'NFL injury warnings sent')
}

// Earliest kickoff time per team for a given NFL week. Returns null if the
// nfl_schedule / games tables don't have data for the week (bye, pre-sync,
// offseason edge cases), signaling callers to fall through to unfiltered
// behavior.
async function buildNflKickoffByTeam(season, week) {
  const { data: schedule } = await supabase
    .from('nfl_schedule')
    .select('game_date')
    .eq('season', season)
    .eq('week', week)
    .not('game_date', 'is', null)
    .order('game_date', { ascending: true })
  if (!schedule?.length) return null
  const rangeStart = schedule[0].game_date
  // nfl_schedule.game_date is an ET calendar date; games.starts_at is UTC. A
  // Monday-night kickoff at 8:15 PM ET is 00:15Z the NEXT UTC day, so bounding
  // the query at `${lastGameDate}T23:59:59Z` cut off every Monday night game —
  // KC/DEN in Week 1, for one, which left both rosters with no kickoff entry
  // and therefore no post-kickoff guard. Pad the tail by two days; the
  // following week's Thursday game is still ~3 days beyond that, so nothing
  // from the next week leaks in.
  const lastDate = new Date(`${schedule[schedule.length - 1].game_date}T00:00:00Z`)
  lastDate.setUTCDate(lastDate.getUTCDate() + 2)
  const rangeEnd = lastDate.toISOString().slice(0, 10)
  const { data: games } = await supabase
    .from('games')
    .select('starts_at, home_team, away_team, sports!inner(key)')
    .eq('sports.key', 'americanfootball_nfl')
    .gte('starts_at', `${rangeStart}T00:00:00Z`)
    .lte('starts_at', `${rangeEnd}T23:59:59Z`)
  if (!games?.length) return null
  const map = {}
  for (const g of games) {
    const kt = new Date(g.starts_at).getTime()
    for (const team of [g.home_team, g.away_team]) {
      if (!team) continue
      // games.home_team / away_team are Odds API DISPLAY NAMES ("Seattle
      // Seahawks") while nfl_players.team is a Sleeper ABBREVIATION ("SEA").
      // This map used to be keyed by the raw display name and then looked up
      // as kickoffByTeam[player.team], so every lookup returned undefined and
      // the post-kickoff guard below never once fired — every owner of an
      // already-played injured starter got told to "swap him out before
      // kickoff". Keyed by abbreviation now; the raw name is kept as a
      // fallback key in case a team is missing from the mapping table.
      const abbr = NFL_FULL_TO_ABBR[team] || team
      const cur = map[abbr]
      if (!cur || kt < cur) map[abbr] = kt
    }
  }
  return map
}
