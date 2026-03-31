import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

// MLB position mapping from ESPN abbreviations
function mapPosition(pos) {
  const map = {
    'SP': 'SP', 'RP': 'RP', 'CL': 'RP',
    'C': 'C', '1B': '1B', '2B': '2B', '3B': '3B', 'SS': 'SS',
    'LF': 'OF', 'CF': 'OF', 'RF': 'OF', 'OF': 'OF',
    'DH': 'UTIL', 'UT': 'UTIL',
  }
  return map[pos] || pos || 'UTIL'
}

/**
 * Fetch season batting averages for an ESPN MLB player.
 */
async function fetchPlayerSeasonAvgs(espnId) {
  try {
    const res = await fetch(`${ESPN_BASE}/baseball/mlb/athletes/${espnId}/stats`)
    if (!res.ok) return null
    const data = await res.json()

    // Look for batting stats
    const batting = data.categories?.find((c) => c.name === 'batting')
    if (!batting?.labels || !batting?.statistics?.length) return null

    const labels = batting.labels
    const latest = batting.statistics[batting.statistics.length - 1]
    const vals = latest.stats || []

    const get = (label) => {
      const idx = labels.indexOf(label)
      return idx >= 0 ? parseFloat(vals[idx]) || 0 : 0
    }

    return {
      gp: get('GP'),
      ab: get('AB'),
      avg: get('AVG'),
      hr: get('HR'),
      rbi: get('RBI'),
      r: get('R'),
      sb: get('SB'),
      h: get('H'),
      bb: get('BB'),
      obp: get('OBP'),
      slg: get('SLG'),
      ops: get('OPS'),
    }
  } catch {
    return null
  }
}

/**
 * MLB DFS fantasy points formula:
 * Hit: 3, Double: 5, Triple: 8, HR: 10, RBI: 2, Run: 2, SB: 5, Walk: 2
 * Per-game average used for salary calc.
 */
function calcMLBFppg(avgs) {
  if (!avgs || avgs.gp < 5) return 0
  const gp = avgs.gp
  // Estimate doubles/triples from hits and HRs (rough)
  const singles = Math.max(0, avgs.h - avgs.hr) // simplified
  const fpp = (singles * 3 + avgs.hr * 10 + avgs.rbi * 2 + avgs.r * 2 + avgs.sb * 5 + avgs.bb * 2) / gp
  return fpp
}

/**
 * Calculate salary from MLB fantasy points per game.
 * $3,000 base + $500/fppg, capped at $10,000.
 */
function mlbFppgToSalary(fppg) {
  if (!fppg || fppg <= 0) return 3000
  const salary = Math.round((3000 + fppg * 500) / 100) * 100
  return Math.max(3000, Math.min(10000, salary))
}

/**
 * Get MLB player pool for a date.
 */
export async function getMLBPlayerPool(date) {
  const { data, error } = await supabase
    .from('mlb_dfs_salaries')
    .select('*')
    .eq('game_date', date)
    .order('salary', { ascending: false })

  if (error) throw error
  if (!data?.length) return []

  // Apply position overrides
  const { data: overrides } = await supabase
    .from('player_position_overrides')
    .select('player_name, position')
    .eq('sport_key', 'baseball_mlb')

  if (overrides?.length) {
    const overrideMap = {}
    for (const o of overrides) overrideMap[o.player_name.toLowerCase()] = o.position
    for (const player of data) {
      const override = overrideMap[player.player_name.toLowerCase()]
      if (override) player.position = override
    }
  }

  return data
}

/**
 * Generate MLB DFS salaries from ESPN rosters for today's games.
 */
export async function generateMLBSalaries(date, season = 2026) {
  logger.info({ date, season }, 'Generating MLB DFS salaries')

  const dateStr = date.replace(/-/g, '')

  let events
  try {
    const res = await fetch(`${ESPN_BASE}/baseball/mlb/scoreboard?dates=${dateStr}`)
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)
    const data = await res.json()
    events = data.events || []
  } catch (err) {
    logger.error({ err }, 'Failed to fetch ESPN MLB scoreboard')
    throw err
  }

  if (!events.length) {
    logger.info({ date }, 'No MLB games today')
    return { generated: 0 }
  }

  const salaries = []

  for (const event of events) {
    const competition = event.competitions?.[0]
    if (!competition) continue

    const gameStartsAt = event.date || null

    for (const competitor of competition.competitors || []) {
      const teamAbbrev = competitor.team?.abbreviation || ''
      const isHome = competitor.homeAway === 'home'
      const opponent = competition.competitors?.find((c) => c.homeAway !== competitor.homeAway)
      const opponentAbbrev = opponent?.team?.abbreviation || ''

      const teamId = competitor.team?.id
      if (!teamId) continue

      // Fetch roster
      let roster
      try {
        const rosterRes = await fetch(`${ESPN_BASE}/baseball/mlb/teams/${teamId}/roster`)
        if (!rosterRes.ok) continue
        roster = await rosterRes.json()
      } catch {
        continue
      }

      const positionGroups = roster.athletes || []
      for (const group of positionGroups) {
        for (const athlete of group.items || []) {
        const rawPos = athlete.position?.abbreviation || ''
        const position = mapPosition(rawPos)

        // Skip pitchers for DFS hitter pool (SP/RP)
        if (position === 'SP' || position === 'RP') continue

        const espnId = athlete.id
        const name = athlete.displayName || athlete.fullName
        if (!name) continue
        const headshot = athlete.headshot?.href || null
        const injury = athlete.injuries?.[0]
        const injuryStatus = injury?.status || null

        const avgs = await fetchPlayerSeasonAvgs(espnId)
        const fppg = calcMLBFppg(avgs)
        const salary = mlbFppgToSalary(fppg)

        salaries.push({
          player_name: name,
          team: teamAbbrev,
          position,
          espn_player_id: espnId,
          game_date: date,
          season,
          salary,
          opponent: `${isHome ? 'vs' : '@'} ${opponentAbbrev}`,
          game_starts_at: gameStartsAt,
          headshot_url: headshot,
          injury_status: injuryStatus,
          is_pitcher: false,
        })
        }
      }
    }
  }

  // Batch upsert
  const CHUNK = 200
  let upserted = 0
  for (let i = 0; i < salaries.length; i += CHUNK) {
    const chunk = salaries.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('mlb_dfs_salaries')
      .upsert(chunk, { onConflict: 'espn_player_id,game_date,season' })

    if (error) {
      logger.error({ error, offset: i }, 'Failed to upsert MLB salary chunk')
    } else {
      upserted += chunk.length
    }
  }

  logger.info({ upserted, total: salaries.length, date, games: events.length }, 'MLB DFS salary generation complete')
  return { upserted, total: salaries.length, games: events.length }
}

/**
 * Save MLB DFS roster.
 */
export async function saveMLBDFSRoster(leagueId, userId, date, season, slots) {
  const totalSalary = slots.reduce((sum, s) => sum + (s.salary || 0), 0)

  // Upsert roster
  const { data: roster, error: rosterErr } = await supabase
    .from('mlb_dfs_rosters')
    .upsert({
      league_id: leagueId,
      user_id: userId,
      game_date: date,
      season,
      total_salary: totalSalary,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'league_id,user_id,game_date,season' })
    .select()
    .single()

  if (rosterErr) throw rosterErr

  // Delete old slots and insert new
  await supabase.from('mlb_dfs_roster_slots').delete().eq('roster_id', roster.id)

  const slotRows = slots.map((s) => ({
    roster_id: roster.id,
    player_name: s.player_name,
    espn_player_id: s.espn_player_id,
    roster_slot: s.roster_slot,
    salary: s.salary,
  }))

  const { error: slotsErr } = await supabase.from('mlb_dfs_roster_slots').insert(slotRows)
  if (slotsErr) throw slotsErr

  return roster
}

/**
 * Get MLB DFS roster for a user on a given date.
 */
export async function getMLBDFSRoster(leagueId, userId, date, season) {
  const { data } = await supabase
    .from('mlb_dfs_rosters')
    .select('*, mlb_dfs_roster_slots(*)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('game_date', date)
    .eq('season', season)
    .maybeSingle()

  return data
}
