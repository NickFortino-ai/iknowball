import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const NBA_SLOTS = ['PG1', 'PG2', 'SG1', 'SG2', 'SF1', 'SF2', 'PF1', 'PF2', 'C']

// Map slot to eligible positions
const SLOT_POSITIONS = {
  PG1: ['PG', 'PG/SG'],
  PG2: ['PG', 'PG/SG'],
  SG1: ['SG', 'PG/SG', 'SG/SF'],
  SG2: ['SG', 'PG/SG', 'SG/SF'],
  SF1: ['SF', 'SG/SF', 'SF/PF'],
  SF2: ['SF', 'SG/SF', 'SF/PF'],
  PF1: ['PF', 'SF/PF', 'PF/C'],
  PF2: ['PF', 'SF/PF', 'PF/C'],
  C: ['C', 'PF/C'],
}

/**
 * Calculate NBA fantasy points from a stat line.
 */
export function calculateNBAFantasyPoints(stats) {
  let pts = 0
  pts += (stats.points || 0) * 1
  pts += (stats.rebounds || 0) * 1.2
  pts += (stats.assists || 0) * 1.5
  pts += (stats.steals || 0) * 3
  pts += (stats.blocks || 0) * 3
  pts += (stats.turnovers || 0) * -1
  pts += (stats.three_pointers_made || 0) * 0.5

  // Double-double bonus
  const statCats = [stats.points || 0, stats.rebounds || 0, stats.assists || 0, stats.steals || 0, stats.blocks || 0]
  const doubleDigitCats = statCats.filter((v) => v >= 10).length
  if (doubleDigitCats >= 3) pts += 3 // triple-double
  else if (doubleDigitCats >= 2) pts += 1.5 // double-double

  return Math.round(pts * 100) / 100
}

/**
 * Get player pool with salaries for a given date.
 */
export async function getNBAPlayerPool(date) {
  const { data, error } = await supabase
    .from('nba_dfs_salaries')
    .select('*')
    .eq('game_date', date)
    .order('salary', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get user's NBA DFS roster for a specific date.
 */
export async function getNBADFSRoster(leagueId, userId, date, season) {
  const { data: roster } = await supabase
    .from('nba_dfs_rosters')
    .select('*, nba_dfs_roster_slots(*)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('game_date', date)
    .eq('season', season)
    .maybeSingle()

  return roster
}

/**
 * Save/update an NBA DFS roster.
 */
export async function saveNBADFSRoster(leagueId, userId, date, season, slots, salaryCap) {
  if (!slots || slots.length === 0) {
    const err = new Error('Roster cannot be empty')
    err.status = 400
    throw err
  }

  for (const slot of slots) {
    if (!NBA_SLOTS.includes(slot.roster_slot)) {
      const err = new Error(`Invalid roster slot: ${slot.roster_slot}`)
      err.status = 400
      throw err
    }

    // Validate position eligibility
    const eligible = SLOT_POSITIONS[slot.roster_slot] || []
    const playerPos = slot.position || ''
    const positionParts = playerPos.split('/')
    const isEligible = eligible.some((e) => {
      if (e.includes('/')) return e === playerPos
      return positionParts.includes(e)
    })

    if (!isEligible && playerPos) {
      const err = new Error(`${slot.player_name} (${playerPos}) is not eligible for ${slot.roster_slot}`)
      err.status = 400
      throw err
    }
  }

  // Check for duplicate slots
  const slotNames = slots.map((s) => s.roster_slot)
  if (new Set(slotNames).size !== slotNames.length) {
    const err = new Error('Duplicate roster slots')
    err.status = 400
    throw err
  }

  // Calculate total salary
  const totalSalary = slots.reduce((sum, s) => sum + s.salary, 0)
  if (totalSalary > salaryCap) {
    const err = new Error(`Roster exceeds salary cap ($${totalSalary.toLocaleString()} > $${salaryCap.toLocaleString()})`)
    err.status = 400
    throw err
  }

  // Upsert roster
  const { data: roster, error: rosterError } = await supabase
    .from('nba_dfs_rosters')
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

  // Delete existing unlocked slots and re-insert
  await supabase
    .from('nba_dfs_roster_slots')
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
      .from('nba_dfs_roster_slots')
      .upsert(slotRows, { onConflict: 'roster_id,roster_slot' })

    if (slotsError) throw slotsError
  }

  return getNBADFSRoster(leagueId, userId, date, season)
}

/**
 * Get NBA DFS standings for a league.
 */
export async function getNBADFSStandings(leagueId) {
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('champion_metric, season')
    .eq('league_id', leagueId)
    .single()

  const { data: results, error } = await supabase
    .from('nba_dfs_nightly_results')
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

/**
 * Get nightly results for a specific date.
 */
export async function getNBANightlyResults(leagueId, date) {
  const { data, error } = await supabase
    .from('nba_dfs_nightly_results')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .eq('game_date', date)
    .order('night_rank', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Admin: set/update NBA DFS salaries for a date.
 */
export async function setNBASalaries(salaries) {
  const { error } = await supabase
    .from('nba_dfs_salaries')
    .upsert(salaries, { onConflict: 'espn_player_id,game_date,season' })

  if (error) throw error
  return { updated: salaries.length }
}

// Map ESPN generic positions to specific NBA positions
function mapPosition(espnPos) {
  const pos = (espnPos || '').toUpperCase()
  const map = {
    'PG': 'PG',
    'SG': 'SG',
    'SF': 'SF',
    'PF': 'PF',
    'C': 'C',
    'G': 'PG/SG',
    'F': 'SF/PF',
    'G-F': 'SG/SF',
    'F-G': 'SG/SF',
    'F-C': 'PF/C',
    'C-F': 'PF/C',
  }
  return map[pos] || pos || 'SF/PF'
}

/**
 * Calculate salary from fantasy points per game average.
 * Uses a curve that maps ~30 fppg → ~$10,000+, ~15 fppg → ~$6,000, ~5 fppg → ~$3,500
 */
function fantasyPointsToSalary(fppg) {
  if (!fppg || fppg <= 0) return 3500
  // Linear scale: $3,500 base + $230 per fppg, capped at $12,500
  const salary = Math.round((3500 + fppg * 230) / 100) * 100
  return Math.max(3500, Math.min(12500, salary))
}

/**
 * Generate NBA DFS salaries from ESPN rosters for tonight's games.
 * Uses season stats for realistic pricing and includes headshots.
 */
export async function generateNBASalaries(date, season = 2026) {
  logger.info({ date, season }, 'Generating NBA DFS salaries')

  const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
  const dateStr = date.replace(/-/g, '')

  let events
  try {
    const res = await fetch(`${ESPN_BASE}/basketball/nba/scoreboard?dates=${dateStr}`)
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)
    const data = await res.json()
    events = data.events || []
  } catch (err) {
    logger.error({ err }, 'Failed to fetch ESPN NBA scoreboard')
    throw err
  }

  if (!events.length) {
    logger.info({ date }, 'No NBA games tonight')
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

      // Fetch roster with season stats
      let roster
      try {
        const rosterRes = await fetch(`${ESPN_BASE}/basketball/nba/teams/${teamId}/roster`)
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
        const headshot = athlete.headshot?.href || null

        // Try to get season averages from the athlete's stats
        // ESPN roster endpoint sometimes includes stats
        let fppg = 0
        const stats = athlete.statistics || athlete.stats || []
        if (stats.length) {
          // ESPN may provide stats differently, try to parse
          const ppg = parseFloat(stats.find?.((s) => s.abbreviation === 'PTS')?.value) || 0
          const rpg = parseFloat(stats.find?.((s) => s.abbreviation === 'REB')?.value) || 0
          const apg = parseFloat(stats.find?.((s) => s.abbreviation === 'AST')?.value) || 0
          const spg = parseFloat(stats.find?.((s) => s.abbreviation === 'STL')?.value) || 0
          const bpg = parseFloat(stats.find?.((s) => s.abbreviation === 'BLK')?.value) || 0
          const tpg = parseFloat(stats.find?.((s) => s.abbreviation === 'TO')?.value) || 0
          fppg = ppg * 1 + rpg * 1.2 + apg * 1.5 + spg * 3 + bpg * 3 - tpg * 1
        }

        // If no stats, estimate by roster order
        if (fppg <= 0) {
          const rank = athletes.indexOf(athlete)
          if (rank < 2) fppg = 35 + Math.random() * 10
          else if (rank < 5) fppg = 20 + Math.random() * 10
          else if (rank < 10) fppg = 10 + Math.random() * 8
          else fppg = 3 + Math.random() * 5
        }

        const salary = fantasyPointsToSalary(fppg)

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
        })
      }
    }
  }

  // Batch upsert
  const CHUNK = 200
  let upserted = 0
  for (let i = 0; i < salaries.length; i += CHUNK) {
    const chunk = salaries.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('nba_dfs_salaries')
      .upsert(chunk, { onConflict: 'espn_player_id,game_date,season' })

    if (error) {
      logger.error({ error, offset: i }, 'Failed to upsert NBA salary chunk')
    } else {
      upserted += chunk.length
    }
  }

  logger.info({ upserted, total: salaries.length, date, games: events.length }, 'NBA DFS salary generation complete')
  return { upserted, total: salaries.length, games: events.length }
}
