import { supabase } from '../config/supabase.js'
import { fetchAll } from '../utils/fetchAll.js'
import { cached } from '../utils/memoCache.js'
import { logger } from '../utils/logger.js'
import { getCurrentNflWeek } from './tdPassService.js'

// NFL stat leaders computed from OUR OWN nfl_player_stats instead of ESPN's
// season-leaders endpoint.
//
// ESPN aggregates on its own schedule and that schedule misses the Sunday
// slate for hours — which is exactly when people open the app. Measured
// 2026-11-01 with the slate in progress:
//
//   player            ours    ESPN
//   Jordan Love       2246    2246   (Thursday game — included)
//   Matthew Stafford  2146    1989
//   Kirk Cousins      2124    1921
//   Joe Burrow        2115    1877
//
// It is not our cache: hitting ESPN directly returns the same stale values.
// Nothing on our side of that request can fix it, so the source changes.
//
// nfl_player_stats is synced from Sleeper every 15 seconds during game
// windows, so these numbers are current within a tick. It also makes Stat
// Leaders agree with the single-stat contests, which already read this table.
const CATEGORIES = [
  { name: 'passingYards', label: 'Pass Yds', cols: ['pass_yd'] },
  { name: 'passingTouchdowns', label: 'Pass TD', cols: ['pass_td'] },
  { name: 'rushingYards', label: 'Rush Yds', cols: ['rush_yd'] },
  { name: 'receivingYards', label: 'Rec Yds', cols: ['rec_yd'] },
  { name: 'totalTouchdowns', label: 'TDs', cols: ['rush_td', 'rec_td'] },
  { name: 'sacks', label: 'Sacks', cols: ['idp_sack'] },
  { name: 'interceptions', label: 'INTs', cols: ['idp_int'] },
  // Solo + assisted, matching ESPN/Yahoo/NFL.com — deliberately NOT the
  // fantasy convention (solo + 0.5*ast) the tackles contest scores.
  { name: 'totalTackles', label: 'Comb. Tkl', cols: ['idp_tkl_solo', 'idp_tkl_ast'] },
]

const STAT_COLS = [...new Set(CATEGORIES.flatMap((c) => c.cols))]
const SELECT = `player_id, ${STAT_COLS.join(', ')}`
const TOP_N = 10

// A full-season scan is ~14k rows over 14 paginated round trips. Run per
// request it is genuinely dangerous: on 2026-09-04 the equivalent query in
// fantasyService, polled by fourteen concurrent drafters, exhausted the
// Supabase connection pool and took the whole app down.
//
// So it is split. Completed weeks cannot change, so they are scanned rarely
// and keyed by the week they run THROUGH — a week rollover mints a new key
// instead of serving a stale base. Only the in-progress week is re-read on
// the fast interval, and that is ~1.5k rows / 2 round trips.
//
// cached() stores the PROMISE, so a herd arriving on an expired entry shares
// one load rather than each starting its own scan.
const BASE_TTL_MS = 20 * 60 * 1000
const LIVE_TTL_MS = 60 * 1000

function emptyTotals() {
  return new Map()
}

function addRows(totals, rows) {
  for (const r of rows) {
    let acc = totals.get(r.player_id)
    if (!acc) { acc = {}; totals.set(r.player_id, acc) }
    for (const c of STAT_COLS) acc[c] = (acc[c] || 0) + (Number(r[c]) || 0)
  }
  return totals
}

function loadBase(season, throughWeek) {
  if (throughWeek < 1) return Promise.resolve(emptyTotals())
  return cached(`nflLeaderBase:${season}:${throughWeek}`, BASE_TTL_MS, async () => {
    const rows = await fetchAll(
      supabase
        .from('nfl_player_stats')
        .select(SELECT)
        .eq('season', season)
        .lte('week', throughWeek)
        .order('player_id'),
    )
    return addRows(emptyTotals(), rows || [])
  })
}

function loadLiveWeek(season, week) {
  return cached(`nflLeaderWeek:${season}:${week}`, LIVE_TTL_MS, async () => {
    const rows = await fetchAll(
      supabase
        .from('nfl_player_stats')
        .select(SELECT)
        .eq('season', season)
        .eq('week', week)
        .order('player_id'),
    )
    return addRows(emptyTotals(), rows || [])
  })
}

function formatValue(name, value) {
  if (name === 'sacks') return (Math.round(value * 10) / 10).toFixed(1)
  return String(Math.round(value))
}

export async function buildNflLeadersFromStats() {
  const { season, week } = await getCurrentNflWeek()
  const [base, live] = await Promise.all([
    loadBase(season, week - 1),
    loadLiveWeek(season, week),
  ])

  // Merge without mutating either cached Map — both are shared, and the live
  // one is re-read every minute while the base one is held for 20.
  const totals = emptyTotals()
  for (const src of [base, live]) {
    for (const [playerId, acc] of src) {
      let dst = totals.get(playerId)
      if (!dst) { dst = {}; totals.set(playerId, dst) }
      for (const c of STAT_COLS) dst[c] = (dst[c] || 0) + (acc[c] || 0)
    }
  }
  if (!totals.size) {
    logger.warn({ season, week }, 'NFL leaders from stats: no rows')
    return null
  }

  // Only the players who actually place in something get looked up, rather
  // than every player who recorded a stat all season.
  const needed = new Set()
  const ranked = {}
  for (const cat of CATEGORIES) {
    const list = [...totals.entries()]
      .map(([playerId, acc]) => ({ playerId, value: cat.cols.reduce((s, c) => s + (acc[c] || 0), 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N)
    ranked[cat.name] = list
    list.forEach((x) => needed.add(x.playerId))
  }

  // Keyed on the exact id set, so the entry is reused for as long as the
  // leaderboard membership holds and refetched the moment it changes. Held
  // longer than the stat caches because a name/headshot/team only moves on a
  // roster transaction.
  const players = await cached(
    `nflLeaderPlayers:${[...needed].sort().join(',')}`,
    BASE_TTL_MS,
    async () => {
      const out = {}
      const ids = [...needed]
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from('nfl_players')
          .select('id, full_name, position, team, headshot_url, espn_id')
          .in('id', ids.slice(i, i + 200))
        for (const p of data || []) out[p.id] = p
      }
      return out
    },
  )

  const categories = CATEGORIES.map((cat) => ({
    name: cat.name,
    label: cat.label,
    leaders: ranked[cat.name].map((x, idx) => {
      const p = players[x.playerId] || {}
      return {
        value: x.value,
        display_value: formatValue(cat.name, x.value),
        // ESPN athlete id, NOT our internal one — PlayerDetailModal looks up
        // by that and silently finds nothing otherwise.
        athlete_id: p.espn_id || null,
        athlete_name: p.full_name || null,
        headshot: p.headshot_url || null,
        position: p.position || null,
        team_id: null,
        team_abbr: p.team || null,
        team_name: p.team || null,
        // Left null on purpose: the UI renders `team_short || team_abbr`, so
        // this falls through to the abbreviation rather than inventing a city
        // name we do not hold.
        team_short: null,
        team_logo: null,
        rank: idx + 1,
      }
    }),
  })).filter((c) => c.leaders.length > 0)

  return { categories, season, source: 'nfl_player_stats' }
}
