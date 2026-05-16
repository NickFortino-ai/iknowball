import { supabase } from '../config/supabase.js'
import { fetchPlayerBoxStats } from './espnService.js'
import { logger } from '../utils/logger.js'

// ---------------------------------------------------------------------------
// WNBA 3-Point Contest — service layer
// ---------------------------------------------------------------------------
// Mirrors the NBA 3-Point Contest service shape, but no `wnba_dfs_salaries`
// table exists to anchor a player pool. Pool is rebuilt per request from
// ESPN's WNBA scoreboard (teams playing tonight) + team rosters (cached),
// then enriched with season 3PM totals from ESPN's leaders endpoint.
// Scoring reuses fetchPlayerBoxStats('basketball_wnba', eventId) — the same
// helper WNBA prop settlement uses, because there's no wnba_player_stats
// table.

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

// Roster cache: teamId -> { players, ts }. WNBA rosters change rarely; 24h
// TTL is plenty.
const rosterCache = new Map()
const ROSTER_TTL = 24 * 60 * 60 * 1000

// Season 3PM leaders cache (regular + post combined). 30-min refresh during
// active play.
let leadersCache = null
let leadersCacheTime = 0
const LEADERS_TTL = 30 * 60 * 1000

// ---------------------------------------------------------------------------
// ESPN helpers
// ---------------------------------------------------------------------------

async function fetch3PMForType(seasonType, accumulator) {
  const targetAbbrevs = new Set(['3PM', 'TPM', 'threePointFieldGoalsMade'])
  const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/2026/types/${seasonType}/leaders?limit=200`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN WNBA leaders ${seasonType} returned ${res.status}`)
  const data = await res.json()
  for (const cat of data.categories || []) {
    const abbr = cat.abbreviation || cat.name || ''
    if (!targetAbbrevs.has(abbr)) continue
    for (const leader of cat.leaders || []) {
      const ref = leader.athlete?.$ref || ''
      const m = ref.match(/\/athletes\/(\d+)/)
      if (!m) continue
      accumulator[m[1]] = (accumulator[m[1]] || 0) + Math.round(leader.value)
    }
    break
  }
}

export async function getWnbaSeason3PMLeaders() {
  if (leadersCache && Date.now() - leadersCacheTime < LEADERS_TTL) return leadersCache
  const map = {}
  try {
    await fetch3PMForType(2, map)
  } catch (err) {
    logger.error({ err: err.message }, 'WNBA 3PM regular-season leaders fetch failed')
    return leadersCache || {}
  }
  try {
    await fetch3PMForType(3, map)
  } catch (err) {
    // Postseason is best-effort
    logger.warn({ err: err.message }, 'WNBA 3PM postseason leaders fetch skipped')
  }
  leadersCache = map
  leadersCacheTime = Date.now()
  return map
}

// Pull team roster (with espn_player_id, name, headshot, position) for one
// WNBA team. Cached per team for 24h. Returns an empty array on any
// failure so a bad roster fetch doesn't sink the whole pool.
async function fetchTeamRoster(teamId, teamAbbrev) {
  const cached = rosterCache.get(teamId)
  if (cached && Date.now() - cached.ts < ROSTER_TTL) return cached.players

  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}/roster`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn({ teamId, status: res.status }, 'WNBA team roster fetch failed')
      return []
    }
    const data = await res.json()
    // ESPN roster shape: { athletes: [{ items: [{ id, displayName, headshot, position }] }] }
    // or sometimes flat { athletes: [...] }. Handle both.
    let athletes = []
    if (Array.isArray(data.athletes)) {
      if (data.athletes[0]?.items) {
        // Grouped by position (Guard / Forward / Center)
        athletes = data.athletes.flatMap((g) => g.items || [])
      } else {
        athletes = data.athletes
      }
    }
    const players = athletes
      .filter((a) => a?.id && a?.displayName)
      .map((a) => ({
        espn_player_id: String(a.id),
        player_name: a.displayName,
        team: teamAbbrev,
        position: a.position?.abbreviation || a.position?.name || null,
        headshot_url: a.headshot?.href || `https://a.espncdn.com/i/headshots/wnba/players/full/${a.id}.png`,
      }))
    rosterCache.set(teamId, { players, ts: Date.now() })
    return players
  } catch (err) {
    logger.error({ err: err.message, teamId }, 'WNBA team roster fetch error')
    return []
  }
}

// Fetch the WNBA scoreboard for one date and return the games. ET is the
// US sports calendar source of truth; the caller passes a YYYY-MM-DD ET
// date string, which ESPN's scoreboard `dates=YYYYMMDD` param accepts.
async function fetchWnbaScoreboardForDate(date) {
  const compact = date.replace(/-/g, '')
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${compact}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data.events || []
  } catch (err) {
    logger.error({ err: err.message, date }, 'WNBA scoreboard fetch error')
    return []
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the WNBA player pool for a given date. Returns players from every
 * team playing on that date in ET, sorted by season 3PM desc. Includes
 * live game state (start time, in-progress flag) so the picks panel can
 * gray out players whose game has already started.
 */
export async function getWNBAPlayerPool(date) {
  const events = await fetchWnbaScoreboardForDate(date)
  if (!events.length) return []

  // Collect unique team_id -> { abbrev, startsAt, state, period, clock }
  const teamGameInfo = {}
  const eventByTeamId = {}
  for (const ev of events) {
    const comp = ev.competitions?.[0]
    if (!comp) continue
    const status = comp.status || ev.status
    const statusType = status?.type?.name
    const liveStatuses = ['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_HALFTIME', 'STATUS_OVERTIME']
    const finalStatuses = ['STATUS_FINAL']
    const state = liveStatuses.includes(statusType) ? 'in'
      : finalStatuses.includes(statusType) ? 'post'
      : 'pre'
    for (const c of comp.competitors || []) {
      const teamId = String(c.team?.id || '')
      const abbrev = (c.team?.abbreviation || '').toUpperCase()
      if (!teamId || !abbrev) continue
      teamGameInfo[teamId] = {
        abbrev,
        startsAt: ev.date || comp.date || null,
        state,
        period: status?.period ? String(status.period) : null,
        clock: status?.displayClock || null,
      }
      eventByTeamId[teamId] = ev.id
    }
  }

  // Fetch each team's roster in parallel (cached per team).
  const teamIds = Object.keys(teamGameInfo)
  const rosters = await Promise.all(teamIds.map((tid) => fetchTeamRoster(tid, teamGameInfo[tid].abbrev)))

  // Merge season 3PM totals.
  const leaders = await getWnbaSeason3PMLeaders()

  const pool = []
  for (let i = 0; i < teamIds.length; i++) {
    const info = teamGameInfo[teamIds[i]]
    for (const p of rosters[i]) {
      pool.push({
        ...p,
        season_threes: leaders[p.espn_player_id] || 0,
        game_state: info.state,
        game_period: info.period,
        game_clock: info.clock,
        game_starts_at: info.startsAt,
        espn_event_id: eventByTeamId[teamIds[i]] || null,
      })
    }
  }

  pool.sort((a, b) => b.season_threes - a.season_threes || a.player_name.localeCompare(b.player_name))
  return pool
}

/**
 * Build a team_abbrev -> game state map for one date. Used by the picks
 * panel and standings views to surface live game info next to each pick.
 */
export async function buildWnbaGameStateByTeam(date) {
  const events = await fetchWnbaScoreboardForDate(date)
  const map = {}
  for (const ev of events) {
    const comp = ev.competitions?.[0]
    if (!comp) continue
    const status = comp.status || ev.status
    const statusType = status?.type?.name
    const liveStatuses = ['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_HALFTIME', 'STATUS_OVERTIME']
    const finalStatuses = ['STATUS_FINAL']
    const state = liveStatuses.includes(statusType) ? 'in'
      : finalStatuses.includes(statusType) ? 'post'
      : 'pre'
    const entry = {
      state,
      period: status?.period ? String(status.period) : null,
      startsAt: ev.date || comp.date || null,
      espn_event_id: ev.id,
    }
    for (const c of comp.competitors || []) {
      const abbrev = (c.team?.abbreviation || '').toUpperCase()
      if (abbrev) map[abbrev] = entry
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function normalizeName(n) {
  return (n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()
}

/**
 * Score every wnba_three_point_picks row whose game has finished. Pulls
 * box stats per ESPN event and updates `made_threes` on each matching pick.
 * Idempotent — only writes when the value differs from what's stored.
 */
export async function scoreAllWnbaThreePointPicks() {
  // Today (ET) and yesterday — covers late-finishing late-night games that
  // span past midnight UTC but settle on the prior US calendar date.
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const yesterdayEt = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  for (const date of [todayEt, yesterdayEt]) {
    const events = await fetchWnbaScoreboardForDate(date)
    const finalEvents = events.filter((ev) => {
      const status = ev.competitions?.[0]?.status || ev.status
      return status?.type?.name === 'STATUS_FINAL'
    })
    if (!finalEvents.length) continue

    // Picks for this date that aren't fully scored yet
    const { data: picks } = await supabase
      .from('wnba_three_point_picks')
      .select('id, espn_player_id, player_name, made_threes')
      .eq('game_date', date)
    if (!picks?.length) continue

    // For each final event, fetch box stats once and apply to all matching picks
    for (const ev of finalEvents) {
      let boxStats
      try {
        boxStats = await fetchPlayerBoxStats('basketball_wnba', ev.id)
      } catch (err) {
        logger.warn({ err: err.message, eventId: ev.id }, 'WNBA box stats fetch failed')
        continue
      }
      if (!boxStats || !Object.keys(boxStats).length) continue

      for (const pick of picks) {
        const key = normalizeName(pick.player_name)
        const stats = boxStats[key]
        if (!stats) continue
        const live = Number(stats.threes) || 0
        if (live !== (Number(pick.made_threes) || 0)) {
          await supabase
            .from('wnba_three_point_picks')
            .update({ made_threes: live, scored_at: new Date().toISOString() })
            .eq('id', pick.id)
        }
      }
    }
  }
}
