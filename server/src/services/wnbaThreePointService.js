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

// Per-athlete 3PM total cache. ESPN's leaderboard `/leaders` endpoint
// reports the 3PM category as a per-game AVERAGE (category name
// `3PointsMadePerGame`, displayName "Average 3-Point Field Goals Made"),
// even though the rest of the response looks like a total. To show real
// season totals in the picker we hit the per-athlete `/statistics/0`
// endpoint which exposes both the total and the per-game avg side-by-side.
// 30-min TTL keeps it fresh during live play without hammering ESPN.
const athleteTotalCache = new Map() // espnId -> { total, ts }
const ATHLETE_TOTAL_TTL = 30 * 60 * 1000

// ---------------------------------------------------------------------------
// ESPN helpers
// ---------------------------------------------------------------------------

// Fetch one athlete's season 3PM TOTAL (regular + post combined). Pulls
// from /seasons/<y>/types/<2|3>/athletes/<id>/statistics/0 — that response
// lists 3PM twice: once as "3-Point Field Goals Made" (total) and once as
// "Average 3-Point Field Goals Made". We want the non-Average one.
async function fetchAthlete3PMForType(espnId, seasonType, season) {
  const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${season}/types/${seasonType}/athletes/${espnId}/statistics/0`
  try {
    const res = await fetch(url)
    if (!res.ok) return 0
    const data = await res.json()
    const cats = data.splits?.categories || []
    for (const cat of cats) {
      if (cat.name !== 'offensive') continue
      for (const s of cat.stats || []) {
        if (s.abbreviation === '3PM' && !(s.displayName || '').toLowerCase().includes('average')) {
          return Math.round(Number(s.value) || 0)
        }
      }
    }
    return 0
  } catch {
    return 0
  }
}

// Fetch 3PM totals for a batch of athletes. Concurrency-capped (6 at a
// time) so we don't burst-hammer ESPN. Per-athlete result cached for the
// `ATHLETE_TOTAL_TTL` window.
//
// WNBA picker shows REGULAR SEASON 3PM only — that's the phase WNBA is
// currently in. Mirrors the NBA decision to show the phase that's
// actually happening (playoffs for NBA). When WNBA reaches playoffs in
// the fall, flip this to type 3 (post) or expose a per-league setting.
export async function fetchSeason3PMTotals(espnIds, season = 2026) {
  const result = {}
  const now = Date.now()
  const toFetch = []
  for (const id of espnIds) {
    const cached = athleteTotalCache.get(id)
    if (cached && now - cached.ts < ATHLETE_TOTAL_TTL) {
      result[id] = cached.total
    } else {
      toFetch.push(id)
    }
  }
  if (!toFetch.length) return result

  const CONCURRENCY = 6
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY)
    const totals = await Promise.all(batch.map((id) => fetchAthlete3PMForType(id, 2, season)))
    for (let j = 0; j < batch.length; j++) {
      const id = batch[j]
      const total = totals[j]
      result[id] = total
      athleteTotalCache.set(id, { total, ts: Date.now() })
    }
  }
  return result
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
        // Only set headshot_url if ESPN actually gave us one. The
        // constructed fallback URL frequently 404s for newer / less
        // prominent players; better to let the client render initials
        // immediately than wait for an HTTP failure.
        headshot_url: a.headshot?.href || null,
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

  // Collect unique team_id -> { abbrev, opponent, startsAt, state, period, clock }
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
    const competitors = comp.competitors || []
    for (const c of competitors) {
      const teamId = String(c.team?.id || '')
      const abbrev = (c.team?.abbreviation || '').toUpperCase()
      if (!teamId || !abbrev) continue
      const opp = competitors.find((x) => String(x.team?.id || '') !== teamId)
      const oppAbbrev = (opp?.team?.abbreviation || '').toUpperCase()
      const isHome = c.homeAway === 'home'
      teamGameInfo[teamId] = {
        abbrev,
        opponent: oppAbbrev ? (isHome ? `vs ${oppAbbrev}` : `@ ${oppAbbrev}`) : null,
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

  // Build the pool first (without 3PM totals), then fetch totals for just
  // the athletes who actually appear in tonight's pool. This bounds the
  // /statistics calls to whoever is playing — typically 100-200 players,
  // cached for 30 min per athlete.
  const pool = []
  for (let i = 0; i < teamIds.length; i++) {
    const info = teamGameInfo[teamIds[i]]
    for (const p of rosters[i]) {
      pool.push({
        ...p,
        season_threes: 0,
        opponent: info.opponent,
        game_state: info.state,
        game_period: info.period,
        game_clock: info.clock,
        game_starts_at: info.startsAt,
        espn_event_id: eventByTeamId[teamIds[i]] || null,
      })
    }
  }

  const totals = await fetchSeason3PMTotals(pool.map((p) => p.espn_player_id))
  for (const p of pool) {
    p.season_threes = totals[p.espn_player_id] || 0
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
