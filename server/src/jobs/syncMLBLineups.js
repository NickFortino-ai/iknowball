import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function tomorrowET() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

/**
 * Fetch probable pitchers and confirmed lineups from ESPN for a given date.
 * Returns { teamProbables: Map<teamAbbrev, espnPitcherId>, confirmedBatters: Map<espnId, battingOrder> }
 */
async function fetchLineupsForDate(date) {
  const dateStr = date.replace(/-/g, '')
  const teamProbables = new Map() // teamAbbrev → espnPitcherId
  const confirmedBatters = new Map() // espnId → battingOrder

  let events
  try {
    const res = await fetch(`${ESPN_BASE}/baseball/mlb/scoreboard?dates=${dateStr}`)
    if (!res.ok) return { teamProbables, confirmedBatters }
    const data = await res.json()
    events = data.events || []
  } catch {
    return { teamProbables, confirmedBatters }
  }

  for (const event of events) {
    const competition = event.competitions?.[0]
    if (!competition) continue

    // Extract probable pitchers from each competitor
    for (const competitor of competition.competitors || []) {
      const teamAbbrev = competitor.team?.abbreviation
      if (!teamAbbrev) continue

      for (const probable of competitor.probables || []) {
        const espnId = probable.athlete?.id
        if (espnId) {
          teamProbables.set(teamAbbrev, String(espnId))
        }
      }
    }

    // For games starting within 3 hours, fetch summary for batting lineups
    const gameStart = new Date(event.date)
    const hoursUntil = (gameStart - new Date()) / (1000 * 60 * 60)
    const statusName = competition.status?.type?.name || event.status?.type?.name || ''
    const isLiveOrFinal = ['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_FINAL'].includes(statusName)

    if (hoursUntil < 3 || isLiveOrFinal) {
      try {
        const res = await fetch(`${ESPN_BASE}/baseball/mlb/summary?event=${event.id}`)
        if (!res.ok) continue
        const summary = await res.json()

        // Check boxscore for batting lineup (starter flag + order)
        for (const team of summary.boxscore?.players || []) {
          for (const statGroup of team.statistics || []) {
            if (statGroup.name !== 'batting') continue
            for (let i = 0; i < (statGroup.athletes || []).length; i++) {
              const athlete = statGroup.athletes[i]
              const espnId = athlete.athlete?.id
              if (espnId && athlete.starter) {
                confirmedBatters.set(String(espnId), i + 1)
              }
            }
          }
        }

        // Also check rosters array (pre-game lineup format)
        for (const roster of summary.rosters || []) {
          for (const entry of roster.roster || []) {
            const espnId = entry.athlete?.id || entry.playerId
            const batOrder = entry.batOrder || entry.battingOrder || entry.order
            if (espnId && batOrder) {
              confirmedBatters.set(String(espnId), Number(batOrder))
            }
          }
        }
      } catch {
        // Game summary not available yet
      }
    }
  }

  return { teamProbables, confirmedBatters }
}

/**
 * Sync MLB starting lineups from ESPN.
 * - Probable starting pitchers (available days ahead)
 * - Confirmed batting lineups (available ~30min before game)
 * - Non-starting pitchers marked as NS
 */
export async function syncMLBLineups() {
  const today = todayET()
  const tomorrow = tomorrowET()
  let totalUpdated = 0

  for (const date of [today, tomorrow]) {
    // Check if we have salaries for this date
    const { count } = await supabase
      .from('mlb_dfs_salaries')
      .select('id', { count: 'exact', head: true })
      .eq('game_date', date)

    if (!count) continue

    const { teamProbables, confirmedBatters } = await fetchLineupsForDate(date)

    // Update pitcher lineup_status based on probables
    if (teamProbables.size > 0) {
      const { data: allPitchers } = await supabase
        .from('mlb_dfs_salaries')
        .select('id, espn_player_id, team, lineup_status')
        .eq('game_date', date)
        .eq('is_pitcher', true)

      for (const p of allPitchers || []) {
        const teamProbableId = teamProbables.get(p.team)
        if (!teamProbableId) continue // No probable announced for this team yet — leave as null

        const newStatus = p.espn_player_id === teamProbableId ? 'confirmed' : 'not_starting'
        if (newStatus !== p.lineup_status) {
          await supabase
            .from('mlb_dfs_salaries')
            .update({ lineup_status: newStatus })
            .eq('id', p.id)
          totalUpdated++
        }
      }
    }

    // Update confirmed batter lineups
    if (confirmedBatters.size > 0) {
      const { data: batters } = await supabase
        .from('mlb_dfs_salaries')
        .select('id, espn_player_id, lineup_status, batting_order')
        .eq('game_date', date)
        .eq('is_pitcher', false)

      // Get set of teams that have confirmed lineups
      const confirmedBatterIds = new Set(confirmedBatters.keys())

      for (const b of batters || []) {
        if (confirmedBatterIds.has(b.espn_player_id)) {
          const order = confirmedBatters.get(b.espn_player_id)
          if (b.lineup_status !== 'confirmed' || b.batting_order !== order) {
            await supabase
              .from('mlb_dfs_salaries')
              .update({ lineup_status: 'confirmed', batting_order: order })
              .eq('id', b.id)
            totalUpdated++
          }
        }
      }
    }
  }

  if (totalUpdated > 0) {
    logger.info({ totalUpdated }, 'MLB lineup sync complete')
  }
}
