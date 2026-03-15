import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchESPNScoreboard, matchESPNToGame } from '../services/espnService.js'
import { scoreCompletedGame, scoreParlayLegs } from '../services/scoringService.js'
import { scoreSurvivorPicks } from '../services/survivorService.js'
import { scoreLeaguePicks } from '../services/leaguePickService.js'
import { scoreBracketMatchups } from '../services/bracketService.js'

const SPORTS = [
  'americanfootball_nfl',
  'americanfootball_ncaaf',
  'basketball_nba',
  'basketball_ncaab',
  'basketball_wncaab',
  'basketball_wnba',
  'baseball_mlb',
  'icehockey_nhl',
  'soccer_usa_mls',
]

async function syncSportLiveScores(sportKey) {
  // Smart gate: only fetch if there are live or recently-started games
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sportKey)
    .single()

  if (!sport) return 0

  const now = new Date()
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)

  const { count: liveCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)
    .eq('status', 'live')

  const { count: recentCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)
    .eq('status', 'upcoming')
    .gte('starts_at', sixHoursAgo.toISOString())
    .lte('starts_at', now.toISOString())

  if (liveCount === 0 && recentCount === 0) {
    logger.debug({ sportKey }, 'No live or recently started games, skipping ESPN fetch')
    return 0
  }

  // Fetch games that could need live score updates
  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('sport_id', sport.id)
    .in('status', ['upcoming', 'live'])
    .gte('starts_at', sixHoursAgo.toISOString())
    .lte('starts_at', new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString())

  if (!games?.length) return 0

  const espnEvents = await fetchESPNScoreboard(sportKey)
  if (!espnEvents.length) return 0

  let updated = 0
  const unmatched = []
  for (const game of games) {
    const match = espnEvents.find((e) => matchESPNToGame(e, game))
    if (!match) {
      // Only flag games already marked live — upcoming games won't be on ESPN yet
      if (game.status === 'live') {
        unmatched.push({ id: game.id, home: game.home_team, away: game.away_team })
      }
      continue
    }

    if (match.state === 'in') {
      // Guard: don't mark a game live if it hasn't reached its start time yet
      if (new Date(game.starts_at) > new Date()) {
        logger.warn({ gameId: game.id, startsAt: game.starts_at }, 'ESPN reports in-progress but game has not reached start time, skipping')
        continue
      }
      const { error } = await supabase
        .from('games')
        .update({
          status: 'live',
          live_home_score: match.homeScore,
          live_away_score: match.awayScore,
          period: match.period,
          clock: match.clock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)

      if (error) {
        logger.error({ error, gameId: game.id }, 'Failed to update live score')
        continue
      }
      updated++
    } else if (match.state === 'post' && game.status === 'live') {
      // ESPN says game is final but our DB still has it as live — finalize it
      let winner = null
      if (match.homeScore > match.awayScore) winner = 'home'
      else if (match.awayScore > match.homeScore) winner = 'away'

      // Only update if still live (prevents race with scoreGames)
      const { data: finalized, error } = await supabase
        .from('games')
        .update({
          status: 'final',
          home_score: match.homeScore,
          away_score: match.awayScore,
          winner,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)
        .eq('status', 'live')
        .select()
        .single()

      if (error || !finalized) {
        if (error) logger.error({ error, gameId: game.id }, 'Failed to finalize game via ESPN')
        continue
      }

      logger.info({ gameId: game.id, home: game.home_team, away: game.away_team, winner }, 'Finalized game via ESPN live sync')

      // Run full scoring pipeline
      try {
        await scoreCompletedGame(game.id, winner, game.sport_id)
        await scoreParlayLegs(game.id, winner)
        await scoreSurvivorPicks(game.id, winner)
        await scoreLeaguePicks(game.id, winner)

        if (winner) {
          try {
            await scoreBracketMatchups(game.home_team, game.away_team, winner, match.homeScore, match.awayScore)
          } catch (err) {
            logger.error({ err, gameId: game.id }, 'Failed to auto-settle bracket matchups via ESPN')
          }
        }
      } catch (err) {
        logger.error({ err, gameId: game.id }, 'Scoring failed for ESPN-finalized game, reverting to live')
        await supabase
          .from('games')
          .update({ status: 'live', updated_at: new Date().toISOString() })
          .eq('id', game.id)
        continue
      }

      updated++
    }
  }

  if (unmatched.length) {
    const espnTeams = espnEvents.map((e) => `${e.awayTeam} @ ${e.homeTeam}`)
    logger.info({ sportKey, unmatched, espnTeams }, 'Unmatched games — no ESPN match found')
  }

  return updated
}

export async function syncLiveScores() {
  logger.info('Starting live scores sync...')

  let total = 0
  for (const sportKey of SPORTS) {
    try {
      const count = await syncSportLiveScores(sportKey)
      total += count
    } catch (err) {
      logger.error({ err, sportKey }, 'Live scores sync failed for sport')
    }
  }

  logger.info({ total }, 'Live scores sync complete')
}
