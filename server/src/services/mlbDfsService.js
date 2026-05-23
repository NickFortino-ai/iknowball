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

// MLB two-way players. ESPN's roster endpoint lists each athlete under a
// single position group, so Ohtani currently slots in as a hitter and is
// missing entirely from the SP pool (DFS, Strikeouts contest, pitcher
// props). For these players we emit a SECOND salary row priced from
// pitching stats, with espn_player_id suffixed -P so it satisfies the
// (espn_player_id, game_date, season) unique constraint and is
// distinguishable downstream.
const TWO_WAY_PLAYER_NAMES = new Set([
  'shohei ohtani',
])

export function isTwoWayPlayer(name) {
  return !!name && TWO_WAY_PLAYER_NAMES.has(name.toLowerCase().trim())
}

export function pitcherIdSuffix(espnId) {
  return `${espnId}-P`
}

/**
 * Fetch season averages for an ESPN MLB player. preferType (optional) lets a
 * caller specifically request pitching stats for a two-way player whose
 * batting category would otherwise win the default precedence.
 */
async function fetchPlayerSeasonAvgs(espnId, preferType = null) {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${espnId}/stats`)
    if (!res.ok) return null
    const data = await res.json()

    function extract(category, type) {
      if (!category?.labels?.length || !category?.statistics?.length) return null
      const labels = category.labels
      const latest = category.statistics[category.statistics.length - 1]
      const vals = latest.stats || []
      const get = (label) => {
        const idx = labels.indexOf(label)
        return idx >= 0 ? parseFloat(vals[idx]) || 0 : 0
      }
      if (type === 'batting') {
        return {
          type: 'batting',
          gp: get('GP'), ab: get('AB'), avg: get('AVG'), hr: get('HR'),
          rbi: get('RBI'), r: get('R'), sb: get('SB'), h: get('H'),
          bb: get('BB'), obp: get('OBP'), slg: get('SLG'), ops: get('OPS'),
          doubles: get('2B'), triples: get('3B'),
        }
      }
      return {
        type: 'pitching',
        gp: get('GP'), gs: get('GS'), w: get('W'), l: get('L'),
        era: get('ERA'), ip: get('IP'), k: get('K'), bb: get('BB'),
        sv: get('SV'), whip: get('WHIP'), h: get('H'), er: get('ER'),
      }
    }

    const batting = data.categories?.find((c) => c.name === 'batting' || c.name === 'career-batting')
    const pitching = data.categories?.find((c) => c.name === 'pitching' || c.name === 'career-pitching')

    if (preferType === 'pitching') return extract(pitching, 'pitching')
    if (preferType === 'batting') return extract(batting, 'batting')

    // Default precedence: batting first (handles position players), pitching fallback.
    return extract(batting, 'batting') || extract(pitching, 'pitching')
  } catch {
    return null
  }
}

/**
 * Sample-size regression toward replacement level. Without this, a 9-AB
 * call-up who happened to slug a HR + 3B in those ABs computes to ~12 FPPG
 * and prices to ~$6,300 — same neighborhood as an established 400-AB hitter
 * with the same FPPG. The Bayesian blend below pulls small samples back
 * toward a 3-FPPG replacement baseline (~$3,200 salary) using 30 phantom
 * "replacement" ABs as the prior. By ~150 AB the prior fades to <20% weight;
 * by 200+ AB it has almost no effect.
 */
const BATTER_REPLACEMENT_FPPG = 3
const BATTER_PHANTOM_AB = 30
function shrinkBatterFppg(fppg, ab) {
  if (!ab || ab >= 200) return fppg
  return (fppg * ab + BATTER_REPLACEMENT_FPPG * BATTER_PHANTOM_AB) / (ab + BATTER_PHANTOM_AB)
}

// Same idea for pitchers. Replacement RP-tier is ~8 FPPG. 20 phantom IP
// keeps a 5-IP cameo from outrunning the prior; established starters
// (80+ IP) get the prior at <3% weight.
const PITCHER_REPLACEMENT_FPPG = 8
const PITCHER_PHANTOM_IP = 20
function shrinkPitcherFppg(fppg, ip) {
  if (!ip || ip >= 80) return fppg
  return (fppg * ip + PITCHER_REPLACEMENT_FPPG * PITCHER_PHANTOM_IP) / (ip + PITCHER_PHANTOM_IP)
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
 * Per-appearance average used for salary calc. Numerator sums production
 * across every appearance (ip, k, etc. are season totals), so the divisor
 * must also be appearances (GP), not starts. Dividing by GS inflated
 * openers' per-game ratios ~10x (e.g. Hudson GP=24/GS=2 priced as a top
 * ace at $11.1k).
 */
function calcMLBPitcherFppg(avgs) {
  if (!avgs || avgs.gp < 1) return 0
  const gp = avgs.gp || avgs.gs
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
 * actually reach the cap and a balanced roster consumes the full $40k.
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
 * Calculate salary from MLB pitcher FPPG (true-starter curve).
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
 * Salary curve for relievers / openers / unproven pitchers. Flatter and
 * lower-capped than the starter curve — a reliever's per-appearance
 * upside is naturally bounded (1-2 IP per outing), and you don't want
 * the quadratic term blowing them up the way it does for true aces.
 *   elite 15 FPPG → $8,000 (cap)
 *   strong 10 FPPG → $7,200
 *   solid 7 FPPG → $6,500
 *   value 4 FPPG → $6,100
 *   replacement 0 FPPG → $5,500
 */
function mlbRelieverFppgToSalary(fppg) {
  if (!fppg || fppg <= 0) return 5500
  const salary = Math.round((5500 + fppg * 120 + fppg * fppg * 5) / 100) * 100
  return Math.max(5500, Math.min(8000, salary))
}

/**
 * Classify a pitcher as starter / reliever / unproven from season totals.
 * Used to pick the right salary curve. The divisor here is GP (same fix
 * as calcMLBPitcherFppg) so openers can't hide behind a deflated GS.
 *
 * Thresholds:
 *   GP < 5            → 'unproven' (not enough data to trust as starter)
 *   IP / GP < 4.5     → 'reliever' (modern starters clear 4.5; openers
 *                       and relief arms sit well under 2.5)
 *   otherwise         → 'starter'
 *
 * Both 'reliever' and 'unproven' price off the flat reliever curve.
 */
function classifyPitcherRole(avgs) {
  if (!avgs || !avgs.gp || avgs.gp < 5) return 'unproven'
  if (avgs.ip <= 0) return 'unproven'
  const ipPerGame = avgs.ip / avgs.gp
  if (ipPerGame >= 4.5) return 'starter'
  return 'reliever'
}

function pitcherSalaryForRole(fppg, role) {
  if (role === 'starter') return mlbPitcherFppgToSalary(fppg)
  return mlbRelieverFppgToSalary(fppg)
}

function pitcherSalaryCapForRole(role) {
  return role === 'starter' ? 11200 : 8000
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
        const opponentLabel = `${isHome ? 'vs' : '@'} ${opponentAbbrev}`

        // Two-way players (Ohtani): always emit BOTH a hitter row (id=espnId,
        // position=UTIL) and a pitcher row (id=espnId-P, position=SP),
        // regardless of which position group ESPN slots them under. ESPN
        // sometimes lists Ohtani in the SP group; without this dual emit,
        // the hitter row would be missing entirely and he'd appear only as
        // "SP · NS" at the bottom of the list on non-pitching days.
        if (isTwoWayPlayer(name)) {
          // Always emit BOTH rows for a two-way player — never gate on the
          // stats fetch succeeding. ESPN's /stats endpoint sometimes drops
          // the 'batting' category when they classify the player as a
          // pitcher (and vice-versa), which is why an earlier version of
          // this code silently lost Ohtani's hitter row when ESPN had him
          // tagged as SP. Missing season stats = floor-price row, not a
          // missing row. Shrinkage pulls the FPPG toward replacement level
          // when sample size is small or zero.
          const gameLog = await fetchGameLog(espnId, 'baseball/mlb', season)
          const batAvgs = await fetchPlayerSeasonAvgs(espnId, 'batting')
          const pitchAvgs = await fetchPlayerSeasonAvgs(espnId, 'pitching')

          // Hitter row (always)
          {
            const batSeasonFppg = batAvgs ? calcMLBBatterFppg(batAvgs) : 0
            let batFppg = calcWeightedFppg(mlbBatterGameFpts, gameLog, batSeasonFppg, { recentN: 10, midN: 20, wRecent: 0.25, wMid: 0.30, wFull: 0.45 })
            batFppg = shrinkBatterFppg(batFppg, batAvgs?.ab || 0)
            let batSalary = mlbFppgToSalary(batFppg)
            batSalary = applyDefensiveAdjustment(batSalary, opponentAbbrev, defRankings, 30)
            const batScarcity = POSITION_SCARCITY['UTIL'] || 1.0
            batSalary = Math.round(batSalary * batScarcity / 100) * 100
            batSalary = Math.max(2500, Math.min(6500, batSalary))
            salaries.push({
              player_name: name,
              team: teamAbbrev,
              position: 'UTIL',
              espn_player_id: espnId,
              game_date: date,
              season,
              salary: batSalary,
              opponent: opponentLabel,
              game_starts_at: gameStartsAt,
              headshot_url: headshot,
              injury_status: injuryStatus,
              is_pitcher: false,
            })
          }

          // Pitcher row (always)
          {
            const pitchSeasonFppg = pitchAvgs ? calcMLBPitcherFppg(pitchAvgs) : 0
            let pitchFppg = calcWeightedFppg(mlbPitcherGameFpts, gameLog, pitchSeasonFppg, { recentN: 10, midN: 20, wRecent: 0.25, wMid: 0.30, wFull: 0.45 })
            pitchFppg = shrinkPitcherFppg(pitchFppg, pitchAvgs?.ip || 0)
            const pitchRole = classifyPitcherRole(pitchAvgs)
            let pitchSalary = pitcherSalaryForRole(pitchFppg, pitchRole)
            pitchSalary = applyDefensiveAdjustment(pitchSalary, opponentAbbrev, defRankings, 30)
            const pitchScarcity = POSITION_SCARCITY['SP'] || 1.0
            pitchSalary = Math.round(pitchSalary * pitchScarcity / 100) * 100
            pitchSalary = Math.max(5500, Math.min(pitcherSalaryCapForRole(pitchRole), pitchSalary))
            salaries.push({
              player_name: name,
              team: teamAbbrev,
              position: 'SP',
              espn_player_id: pitcherIdSuffix(espnId),
              game_date: date,
              season,
              salary: pitchSalary,
              opponent: opponentLabel,
              game_starts_at: gameStartsAt,
              headshot_url: headshot,
              injury_status: injuryStatus,
              is_pitcher: true,
            })
          }
          continue
        }

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
        let fppg = calcWeightedFppg(gameFptsFn, gameLog, seasonFppg, { recentN: 10, midN: 20, wRecent: 0.25, wMid: 0.30, wFull: 0.45 })
        // Sample-size regression — keeps tiny-sample call-ups (e.g. 9-AB
        // rookie with a hot first week) from being priced as everyday
        // starters. See shrinkBatterFppg / shrinkPitcherFppg above.
        if (isPitcher) {
          fppg = shrinkPitcherFppg(fppg, avgs?.ip || 0)
        } else {
          fppg = shrinkBatterFppg(fppg, avgs?.ab || 0)
        }

        const displayPos = isPitcher ? 'SP' : position
        const pitcherRole = isPitcher ? classifyPitcherRole(avgs) : null
        let salary = isPitcher
          ? pitcherSalaryForRole(fppg, pitcherRole)
          : mlbFppgToSalary(fppg)
        salary = applyDefensiveAdjustment(salary, opponentAbbrev, defRankings, 30)
        // Apply position scarcity multiplier
        const scarcity = POSITION_SCARCITY[displayPos] || 1.0
        salary = Math.round(salary * scarcity / 100) * 100
        // Re-clamp after adjustments to enforce hard caps
        if (isPitcher) salary = Math.max(5500, Math.min(pitcherSalaryCapForRole(pitcherRole), salary))
        else salary = Math.max(2500, Math.min(6500, salary))

        salaries.push({
          player_name: name,
          team: teamAbbrev,
          position: displayPos,
          espn_player_id: espnId,
          game_date: date,
          season,
          salary,
          opponent: opponentLabel,
          game_starts_at: gameStartsAt,
          headshot_url: headshot,
          injury_status: injuryStatus,
          is_pitcher: isPitcher,
        })
        }
      }
    }
  }

  // Clear stale entries — see scoreNBADFS for rationale.
  if (salaries.length > 0) {
    const { error: delErr } = await supabase
      .from('mlb_dfs_salaries')
      .delete()
      .eq('game_date', date)
      .eq('season', season)
    if (delErr) logger.error({ delErr, date, season }, 'Failed to clear stale MLB salaries before regen')
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

  // Dedup by exact espn_player_id — the same row can't fill two slots.
  // Two-way players (Ohtani) carry distinct ids for hitter (`${id}`) and
  // pitcher (`${id}-P`) and are allowed to occupy SP and UTIL together.
  const seenIds = new Set()
  for (const s of slots) {
    const id = s.espn_player_id
    if (!id) continue
    if (seenIds.has(id)) {
      const err = new Error('Cannot draft the same player in multiple slots')
      err.status = 400
      throw err
    }
    seenIds.add(id)
  }

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
