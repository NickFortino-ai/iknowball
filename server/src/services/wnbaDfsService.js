import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchGameLog, calcWeightedFppg, fetchDefensiveRankings, applyDefensiveAdjustment } from '../utils/dfsAlgorithm.js'

// 2 G / 2 F / 1 C / 4 UTIL = 9 slots. Step-1 data verification (208
// league-wide players) showed ESPN tags every WNBA player as exactly G,
// F, or C with 0 hybrid tags — so the eligibility map stays simple.
// The single C slot is deliberate: only 25 league-wide centers, with LA
// carrying 0; two dedicated C slots would force near-identical lineups
// on a thin slate. UTIL slots accept any position.
const WNBA_SLOTS = ['G1', 'G2', 'F1', 'F2', 'C', 'UTIL1', 'UTIL2', 'UTIL3', 'UTIL4']

const SLOT_POSITIONS = {
  G1: ['G'],
  G2: ['G'],
  F1: ['F'],
  F2: ['F'],
  C: ['C'],
  UTIL1: ['G', 'F', 'C'],
  UTIL2: ['G', 'F', 'C'],
  UTIL3: ['G', 'F', 'C'],
  UTIL4: ['G', 'F', 'C'],
}

/**
 * Calculate WNBA fantasy points from a stat line. Same formula as NBA DFS:
 * points × 1 + reb × 1.2 + ast × 1.5 + stl × 3 + blk × 3 − to + 3pm × 0.5.
 * Double-double / triple-double bonuses kept identical.
 */
export function calculateWNBAFantasyPoints(stats) {
  let pts = 0
  pts += (stats.points || 0) * 1
  pts += (stats.rebounds || 0) * 1.2
  pts += (stats.assists || 0) * 1.5
  pts += (stats.steals || 0) * 3
  pts += (stats.blocks || 0) * 3
  pts += (stats.turnovers || 0) * -1
  pts += (stats.three_pointers_made || 0) * 0.5

  const statCats = [stats.points || 0, stats.rebounds || 0, stats.assists || 0, stats.steals || 0, stats.blocks || 0]
  const doubleDigitCats = statCats.filter((v) => v >= 10).length
  if (doubleDigitCats >= 3) pts += 3
  else if (doubleDigitCats >= 2) pts += 1.5

  return Math.round(pts * 100) / 100
}

export async function getWNBAPlayerPool(date) {
  const { data, error } = await supabase
    .from('wnba_dfs_salaries')
    .select('*')
    .eq('game_date', date)
    .order('salary', { ascending: false })

  if (error) throw error
  if (!data?.length) return []

  const { data: overrides } = await supabase
    .from('player_position_overrides')
    .select('player_name, position')

  if (overrides?.length) {
    const overrideMap = {}
    for (const o of overrides) overrideMap[o.player_name.toLowerCase()] = o.position
    for (const player of data) {
      const override = overrideMap[player.player_name.toLowerCase()]
      if (override) player.position = override
    }
  }

  // Attach live game period/clock from games table
  const { data: sportRow } = await supabase.from('sports').select('id').eq('key', 'basketball_wnba').single()
  if (sportRow) {
    const { data: liveGames } = await supabase
      .from('games')
      .select('starts_at, period, clock, status, home_team, away_team')
      .eq('sport_id', sportRow.id)
      .in('status', ['live', 'final'])

    if (liveGames?.length) {
      const gameMap = {}
      for (const g of liveGames) {
        gameMap[g.home_team] = g
        gameMap[g.away_team] = g
      }
      for (const player of data) {
        const game = gameMap[player.team]
        if (game) {
          player.game_period = game.period
          player.game_clock = game.clock
          player.game_status = game.status
        }
      }
    }
  }

  return data
}

export async function getWNBADFSRoster(leagueId, userId, date, season) {
  const { data: roster } = await supabase
    .from('wnba_dfs_rosters')
    .select('*, wnba_dfs_roster_slots(*)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('game_date', date)
    .eq('season', season)
    .maybeSingle()

  return roster
}

export async function saveWNBADFSRoster(leagueId, userId, date, season, slots, salaryCap) {
  if (!slots || slots.length === 0) {
    const err = new Error('Roster cannot be empty')
    err.status = 400
    throw err
  }

  for (const slot of slots) {
    if (!WNBA_SLOTS.includes(slot.roster_slot)) {
      const err = new Error(`Invalid roster slot: ${slot.roster_slot}`)
      err.status = 400
      throw err
    }

    const eligible = SLOT_POSITIONS[slot.roster_slot] || []
    const playerPos = (slot.position || '').toUpperCase()
    const isEligible = eligible.includes(playerPos)

    if (!isEligible && playerPos) {
      const err = new Error(`${slot.player_name} (${playerPos}) is not eligible for ${slot.roster_slot}`)
      err.status = 400
      throw err
    }
  }

  const slotNames = slots.map((s) => s.roster_slot)
  if (new Set(slotNames).size !== slotNames.length) {
    const err = new Error('Duplicate roster slots')
    err.status = 400
    throw err
  }

  const totalSalary = slots.reduce((sum, s) => sum + s.salary, 0)
  if (totalSalary > salaryCap) {
    const err = new Error(`Roster exceeds salary cap ($${totalSalary.toLocaleString()} > $${salaryCap.toLocaleString()})`)
    err.status = 400
    throw err
  }

  const { data: roster, error: rosterError } = await supabase
    .from('wnba_dfs_rosters')
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

  if (rosterError) throw rosterError

  await supabase
    .from('wnba_dfs_roster_slots')
    .delete()
    .eq('roster_id', roster.id)
    .eq('is_locked', false)

  const slotRows = slots
    .filter((s) => !s.is_locked)
    .map((s) => ({
      roster_id: roster.id,
      player_name: s.player_name,
      espn_player_id: s.espn_player_id || null,
      roster_slot: s.roster_slot,
      salary: s.salary,
    }))

  if (slotRows.length > 0) {
    const { error: slotsError } = await supabase
      .from('wnba_dfs_roster_slots')
      .upsert(slotRows, { onConflict: 'roster_id,roster_slot' })

    if (slotsError) throw slotsError
  }

  return getWNBADFSRoster(leagueId, userId, date, season)
}

export async function getWNBADFSStandings(leagueId) {
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('champion_metric, season')
    .eq('league_id', leagueId)
    .single()

  const { data: results, error } = await supabase
    .from('wnba_dfs_nightly_results')
    .select('user_id, game_date, total_points, night_rank, is_night_winner, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .order('game_date', { ascending: true })

  if (error) throw error

  const userMap = {}
  for (const r of (results || [])) {
    if (!userMap[r.user_id]) {
      userMap[r.user_id] = { user: r.users, totalPoints: 0, nightlyWins: 0, nights: [] }
    }
    userMap[r.user_id].totalPoints += Number(r.total_points)
    if (r.is_night_winner) userMap[r.user_id].nightlyWins++
    userMap[r.user_id].nights.push({
      date: r.game_date,
      points: r.total_points,
      rank: r.night_rank,
      isWinner: r.is_night_winner,
    })
  }

  const standings = Object.values(userMap)
  if (settings?.champion_metric === 'most_wins') {
    standings.sort((a, b) => b.nightlyWins - a.nightlyWins || b.totalPoints - a.totalPoints)
  } else {
    standings.sort((a, b) => b.totalPoints - a.totalPoints)
  }

  return {
    standings: standings.map((s, i) => ({ ...s, rank: i + 1 })),
    championMetric: settings?.champion_metric || 'total_points',
  }
}

export async function getWNBANightlyResults(leagueId, date) {
  const { data, error } = await supabase
    .from('wnba_dfs_nightly_results')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .eq('game_date', date)
    .order('night_rank', { ascending: true })

  if (error) throw error
  return data || []
}

// ESPN tags every WNBA player as exactly G, F, or C. No hybrid normalization
// needed — just uppercase and pass through.
function mapPosition(espnPos) {
  const pos = (espnPos || '').toUpperCase()
  if (pos === 'G' || pos === 'F' || pos === 'C') return pos
  // Unknown / odd tag — default to F (the largest non-G bucket).
  return 'F'
}

/**
 * Fetch season averages for an ESPN WNBA player.
 * Verified Step-1: identical shape to NBA endpoint.
 */
async function fetchPlayerSeasonAvgs(espnId) {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/common/v3/sports/basketball/wnba/athletes/${espnId}/stats`)
    if (!res.ok) return null
    const data = await res.json()
    const avgs = data.categories?.find((c) => c.name === 'averages')
    if (!avgs?.labels || !avgs?.statistics?.length) return null

    const labels = avgs.labels
    const latest = avgs.statistics[avgs.statistics.length - 1]
    const vals = latest.stats || []

    const get = (label) => {
      const idx = labels.indexOf(label)
      return idx >= 0 ? parseFloat(vals[idx]) || 0 : 0
    }

    const threeStr = String(vals[labels.indexOf('3PT')] || '0')
    const threes = parseFloat(threeStr.split('-')[0]) || 0

    return {
      ppg: get('PTS'),
      rpg: get('REB'),
      apg: get('AST'),
      spg: get('STL'),
      bpg: get('BLK'),
      tpg: get('TO'),
      threes,
      gp: get('GP'),
    }
  } catch {
    return null
  }
}

function wnbaGameFpts(statMap) {
  const pts = parseFloat(statMap['PTS']) || 0
  const reb = parseFloat(statMap['REB']) || 0
  const ast = parseFloat(statMap['AST']) || 0
  const stl = parseFloat(statMap['STL']) || 0
  const blk = parseFloat(statMap['BLK']) || 0
  const to = parseFloat(statMap['TO']) || 0
  const threeStr = String(statMap['3PT'] || '0')
  const threes = parseFloat(threeStr.split('-')[0]) || 0
  const min = parseInt(statMap['MIN']) || 0
  if (min === 0) return null
  return pts * 1 + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3 - to * 1 + threes * 0.5
}

/**
 * Calculate WNBA salary from fantasy points per game average.
 * $3,500 base + $170/fppg, capped at $11,000.
 *
 * NBA's slope is $130/fppg. NBA top stars sit around 55-65 FPPG and hit
 * the $11k cap. WNBA top stars (A'ja Wilson, Caitlin Clark) sit around
 * 40-46 FPPG — so a steeper slope (~$170/fppg) keeps the spread using
 * the full $3,500-$11,000 range and lands the top players near the cap.
 *   45 FPPG → 3500 + 45×170 = 11,150 → cap at 11,000
 *   25 FPPG → 3500 + 25×170 = 7,750
 *   10 FPPG → 3500 + 10×170 = 5,200
 *    3 FPPG → 3500 + 3×170  = 4,010
 */
function fantasyPointsToSalary(fppg) {
  if (!fppg || fppg <= 0) return 3500
  const salary = Math.round((3500 + fppg * 170) / 100) * 100
  return Math.max(3500, Math.min(11000, salary))
}

/**
 * Generate WNBA DFS salaries from ESPN rosters for tonight's games.
 * Mirrors generateNBASalaries with the WNBA endpoint + slope.
 *
 * gp >= 3 threshold (vs NBA's 5) because the WNBA season is shorter
 * (~40 games) and the early-season window has fewer games per player.
 */
export async function generateWNBASalaries(date, season = 2026) {
  logger.info({ date, season }, 'Generating WNBA DFS salaries')

  const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
  const dateStr = date.replace(/-/g, '')

  let events
  try {
    const res = await fetch(`${ESPN_BASE}/basketball/wnba/scoreboard?dates=${dateStr}`)
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)
    const data = await res.json()
    events = data.events || []
  } catch (err) {
    logger.error({ err }, 'Failed to fetch ESPN WNBA scoreboard')
    throw err
  }

  if (!events.length) {
    logger.info({ date }, 'No WNBA games tonight')
    return { generated: 0 }
  }

  const defRankings = await fetchDefensiveRankings('basketball/wnba')

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

      let roster
      try {
        const rosterRes = await fetch(`${ESPN_BASE}/basketball/wnba/teams/${teamId}/roster`)
        if (!rosterRes.ok) continue
        roster = await rosterRes.json()
      } catch {
        continue
      }

      const athletes = roster.athletes || []
      for (const athlete of athletes) {
        const rawPos = athlete.position?.abbreviation || ''
        const position = mapPosition(rawPos)
        const espnId = athlete.id
        const name = athlete.displayName || athlete.fullName
        if (!espnId || !name) continue
        const headshot = athlete.headshot?.href || null
        const injury = athlete.injuries?.[0]
        const injuryStatus = injury?.status || null
        const injuryDetail = injury?.shortComment || null

        const avgs = await fetchPlayerSeasonAvgs(espnId)
        let seasonFppg = 0
        if (avgs && avgs.gp >= 3) {
          seasonFppg = avgs.ppg * 1 + avgs.rpg * 1.2 + avgs.apg * 1.5
            + avgs.spg * 3 + avgs.bpg * 3 - avgs.tpg * 1
            + avgs.threes * 0.5
        }

        const gameLog = await fetchGameLog(espnId, 'basketball/wnba', season)
        const fppg = calcWeightedFppg(wnbaGameFpts, gameLog, seasonFppg, { recentN: 10, midN: 20 })

        let salary = fantasyPointsToSalary(fppg)
        salary = applyDefensiveAdjustment(salary, opponentAbbrev, defRankings, 12) // 12 WNBA teams

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
          injury_detail: injuryDetail,
        })
      }
    }
  }

  if (salaries.length > 0) {
    const { error: delErr } = await supabase
      .from('wnba_dfs_salaries')
      .delete()
      .eq('game_date', date)
      .eq('season', season)
    if (delErr) logger.error({ delErr, date, season }, 'Failed to clear stale WNBA salaries before regen')
  }

  const CHUNK = 200
  let upserted = 0
  for (let i = 0; i < salaries.length; i += CHUNK) {
    const chunk = salaries.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('wnba_dfs_salaries')
      .upsert(chunk, { onConflict: 'espn_player_id,game_date,season' })

    if (error) {
      logger.error({ error, offset: i }, 'Failed to upsert WNBA salary chunk')
    } else {
      upserted += chunk.length
    }
  }

  logger.info({ upserted, total: salaries.length, date, games: events.length }, 'WNBA DFS salary generation complete')
  return { upserted, total: salaries.length, games: events.length }
}

export async function setWNBASalaries(salaries) {
  const { error } = await supabase
    .from('wnba_dfs_salaries')
    .upsert(salaries, { onConflict: 'espn_player_id,game_date,season' })
  if (error) throw error
  return { updated: salaries.length }
}
