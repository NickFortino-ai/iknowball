import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchGameLog, calcWeightedFppg, fetchDefensiveRankings, applyDefensiveAdjustment } from '../utils/dfsAlgorithm.js'

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
    const res = await fetch(`https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${espnId}/stats`)
    if (!res.ok) return null
    const data = await res.json()

    // Look for batting stats (ESPN uses 'batting' or 'career-batting')
    const batting = data.categories?.find((c) => c.name === 'batting' || c.name === 'career-batting')
    if (batting?.labels?.length && batting?.statistics?.length) {
      const labels = batting.labels
      const latest = batting.statistics[batting.statistics.length - 1]
      const vals = latest.stats || []
      const get = (label) => {
        const idx = labels.indexOf(label)
        return idx >= 0 ? parseFloat(vals[idx]) || 0 : 0
      }
      return {
        type: 'batting',
        gp: get('GP'), ab: get('AB'), avg: get('AVG'), hr: get('HR'),
        rbi: get('RBI'), r: get('R'), sb: get('SB'), h: get('H'),
        bb: get('BB'), obp: get('OBP'), slg: get('SLG'), ops: get('OPS'),
        doubles: get('2B'), triples: get('3B'),
      }
    }

    // Look for pitching stats (ESPN uses 'pitching' or 'career-pitching')
    const pitching = data.categories?.find((c) => c.name === 'pitching' || c.name === 'career-pitching')
    if (pitching?.labels?.length && pitching?.statistics?.length) {
      const labels = pitching.labels
      const latest = pitching.statistics[pitching.statistics.length - 1]
      const vals = latest.stats || []
      const get = (label) => {
        const idx = labels.indexOf(label)
        return idx >= 0 ? parseFloat(vals[idx]) || 0 : 0
      }
      return {
        type: 'pitching',
        gp: get('GP'), gs: get('GS'), w: get('W'), l: get('L'),
        era: get('ERA'), ip: get('IP'), k: get('K'), bb: get('BB'),
        sv: get('SV'), whip: get('WHIP'), h: get('H'), er: get('ER'),
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * MLB DFS fantasy points formula (batters):
 * Single: 3, Double: 5, Triple: 8, HR: 10, RBI: 2, Run: 2, SB: 5, Walk: 2
 * Per-game average used for salary calc.
 */
function calcMLBBatterFppg(avgs) {
  if (!avgs || avgs.gp < 1) return 0
  const gp = avgs.gp
  const doubles = avgs.doubles || 0
  const triples = avgs.triples || 0
  const singles = Math.max(0, avgs.h - doubles - triples - avgs.hr)
  return (singles * 3 + doubles * 5 + triples * 8 + avgs.hr * 10 + avgs.rbi * 2 + avgs.r * 2 + avgs.sb * 5 + avgs.bb * 2) / gp
}

/**
 * MLB DFS fantasy points formula (pitchers):
 * IP: 3 per inning, K: 2, W: 5, SV: 5, ER: -2, BB: -0.5, H: -0.5
 * Per-start average used for salary calc.
 */
function calcMLBPitcherFppg(avgs) {
  if (!avgs || avgs.gp < 1) return 0
  const gp = avgs.gs || avgs.gp
  if (gp <= 0) return 0
  const ipPerGame = avgs.ip / gp
  const kPerGame = avgs.k / gp
  const wPerGame = avgs.w / gp
  const svPerGame = avgs.sv / gp
  const erPerGame = avgs.er / gp
  const bbPerGame = avgs.bb / gp
  const hPerGame = avgs.h / gp
  return ipPerGame * 3 + kPerGame * 2 + wPerGame * 5 + svPerGame * 5
    - erPerGame * 2 - bbPerGame * 0.5 - hPerGame * 0.5
}

/**
 * Calculate MLB batter fantasy points from a single game stat map (ESPN gamelog).
 */
function mlbBatterGameFpts(statMap) {
  const ab = parseInt(statMap['AB']) || 0
  if (ab === 0 && !statMap['AB']) return null // DNP
  const h = parseInt(statMap['H']) || 0
  const doubles = parseInt(statMap['2B']) || 0
  const triples = parseInt(statMap['3B']) || 0
  const hr = parseInt(statMap['HR']) || 0
  const rbi = parseInt(statMap['RBI']) || 0
  const r = parseInt(statMap['R']) || 0
  const sb = parseInt(statMap['SB']) || 0
  const bb = parseInt(statMap['BB']) || 0
  const singles = Math.max(0, h - doubles - triples - hr)
  return singles * 3 + doubles * 5 + triples * 8 + hr * 10 + rbi * 2 + r * 2 + sb * 5 + bb * 2
}

/**
 * Calculate MLB pitcher fantasy points from a single game stat map (ESPN gamelog).
 */
function mlbPitcherGameFpts(statMap) {
  const ip = parseFloat(statMap['IP']) || 0
  if (ip === 0) return null
  const k = parseInt(statMap['K'] || statMap['SO']) || 0
  const w = parseInt(statMap['W']) || 0
  const sv = parseInt(statMap['SV']) || 0
  const er = parseInt(statMap['ER']) || 0
  const bb = parseInt(statMap['BB']) || 0
  const h = parseInt(statMap['H']) || 0
  return ip * 3 + k * 2 + w * 5 + sv * 5 - er * 2 - bb * 0.5 - h * 0.5
}

/**
 * Calculate salary from MLB batter FPPG.
 * Lifted floor + steeper quadratic so practical top-of-pool prices
 * actually reach the cap and a balanced roster consumes the full $60k.
 *   elite 13 FPPG → $6,500 (cap)
 *   strong 10 FPPG → $5,500
 *   solid  8 FPPG → $4,700
 *   average 6 FPPG → $4,100
 *   value  3 FPPG → $3,200
 *   replacement 0 FPPG → $2,500
 */
function mlbFppgToSalary(fppg) {
  if (!fppg || fppg <= 0) return 2500
  // Quadratic curve: accelerates pricing for elite performers
  const salary = Math.round((2500 + fppg * 200 + fppg * fppg * 10) / 100) * 100
  return Math.max(2500, Math.min(6500, salary))
}

/**
 * Calculate salary from MLB pitcher FPPG.
 * Steeper curve so elite aces (Skenes-tier) consistently hit $10,500+.
 *   elite 38 FPPG → $11,200
 *   strong 30 FPPG → $10,400
 *   solid 23 FPPG → $9,100
 *   average 15 FPPG → $7,700
 *   value 8 FPPG  → $6,500
 *   replacement 0 FPPG → $5,500
 */
function mlbPitcherFppgToSalary(fppg) {
  if (!fppg || fppg <= 0) return 5500
  // Quadratic curve: elite pitchers cost significantly more
  const salary = Math.round((5500 + fppg * 100 + fppg * fppg * 2) / 100) * 100
  return Math.max(5500, Math.min(11200, salary))
}

/**
 * Position scarcity / production multipliers applied AFTER the base
 * FPPG → salary calc. These reflect typical fantasy production at each
 * position, not market scarcity — lower = cheaper.
 *
 * Catchers dropped from 0.85 → 0.70 since they produce poorly in
 * fantasy and elite-catcher salaries were still uncomfortably high.
 * Other positions unchanged.
 */
const POSITION_SCARCITY = {
  C: 0.85,
  SS: 0.95,
  '2B': 0.95,
  '1B': 1.00,
  '3B': 1.00,
  OF: 1.00,
  UTIL: 1.00,
  SP: 1.00,
  RP: 0.90,
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

  // Fetch defensive rankings (cached 6h)
  const defRankings = await fetchDefensiveRankings('baseball/mlb')

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
        const isPitcher = position === 'SP' || position === 'RP'

        const espnId = athlete.id
        const name = athlete.displayName || athlete.fullName
        if (!name) continue
        const headshot = athlete.headshot?.href || null
        const injury = athlete.injuries?.[0]
        const injuryStatus = injury?.status || null

        const avgs = await fetchPlayerSeasonAvgs(espnId)
        let seasonFppg
        if (isPitcher) {
          seasonFppg = avgs?.type === 'pitching' ? calcMLBPitcherFppg(avgs) : 0
        } else {
          seasonFppg = avgs?.type === 'batting' ? calcMLBBatterFppg(avgs) : 0
        }

        const gameLog = await fetchGameLog(espnId, 'baseball/mlb', season)
        const gameFptsFn = isPitcher ? mlbPitcherGameFpts : mlbBatterGameFpts
        // Season-heavy weights: 25% recent, 30% mid, 45% full season
        // Prevents hot-streak players from outpricing established stars
        const fppg = calcWeightedFppg(gameFptsFn, gameLog, seasonFppg, { recentN: 10, midN: 20, wRecent: 0.25, wMid: 0.30, wFull: 0.45 })

        const displayPos = isPitcher ? 'SP' : position
        let salary = isPitcher ? mlbPitcherFppgToSalary(fppg) : mlbFppgToSalary(fppg)
        salary = applyDefensiveAdjustment(salary, opponentAbbrev, defRankings, 30)
        // Apply position scarcity multiplier
        const scarcity = POSITION_SCARCITY[displayPos] || 1.0
        salary = Math.round(salary * scarcity / 100) * 100
        // Re-clamp after adjustments to enforce hard caps
        if (isPitcher) salary = Math.max(5500, Math.min(11200, salary))
        else salary = Math.max(2500, Math.min(6500, salary))

        salaries.push({
          player_name: name,
          team: teamAbbrev,
          position: displayPos,
          espn_player_id: espnId,
          game_date: date,
          season,
          salary,
          opponent: `${isHome ? 'vs' : '@'} ${opponentAbbrev}`,
          game_starts_at: gameStartsAt,
          headshot_url: headshot,
          injury_status: injuryStatus,
          is_pitcher: isPitcher,
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
  const { data: rosterRows, error: rosterErr } = await supabase
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

  if (rosterErr) throw rosterErr
  const roster = rosterRows?.[0]
  if (!roster) throw new Error('Failed to create roster')

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
