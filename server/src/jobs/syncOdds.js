import { supabase } from '../config/supabase.js'
import { fetchOdds } from '../services/oddsService.js'
import { logger } from '../utils/logger.js'

async function syncSport(sportKey) {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sportKey)
    .single()

  if (!sport) {
    logger.warn({ sportKey }, 'Sport not found in database, skipping')
    return 0
  }

  // Smart gate: skip API call if no relevant games
  const now = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // If this sport has games in the DB, apply filters.
  // If zero games exist (first run / new sport), bypass and call API for discovery.
  const { count: totalGames } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)

  if (totalGames > 0) {
    // Check: Any upcoming games within the next 7 days?
    const { count: upcomingCount } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('sport_id', sport.id)
      .eq('status', 'upcoming')
      .gte('starts_at', now.toISOString())
      .lte('starts_at', sevenDaysFromNow.toISOString())

    if (upcomingCount === 0) {
      logger.debug({ sportKey }, 'No upcoming games within 7 days, skipping odds sync')
      return 0
    }
  }

  let events
  try {
    events = await fetchOdds(sportKey)
  } catch (err) {
    logger.error({ err, sportKey }, 'Failed to fetch odds')
    return 0
  }

  logger.info({ sportKey, count: events.length }, 'Fetched events from Odds API')

  let upserted = 0
  for (const event of events) {
    const bookmaker = event.bookmakers?.[0]
    const h2hMarket = bookmaker?.markets?.find((m) => m.key === 'h2h')
    const outcomes = h2hMarket?.outcomes || []

    const homeOutcome = outcomes.find((o) => o.name === event.home_team)
    const awayOutcome = outcomes.find((o) => o.name === event.away_team)

    const { error } = await supabase
      .from('games')
      .upsert(
        {
          external_id: event.id,
          sport_id: sport.id,
          home_team: event.home_team,
          away_team: event.away_team,
          starts_at: event.commence_time,
          home_odds: homeOutcome?.price || null,
          away_odds: awayOutcome?.price || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'external_id' }
      )

    if (error) {
      logger.error({ error, eventId: event.id }, 'Failed to upsert game')
    } else {
      upserted++
    }
  }

  return upserted
}

export async function syncOdds() {
  logger.info('Starting odds sync...')

  const sports = ['americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'basketball_ncaab', 'americanfootball_ncaaf', 'basketball_wnba']
  let total = 0

  for (const sportKey of sports) {
    const count = await syncSport(sportKey)
    total += count
  }

  logger.info({ total }, 'Odds sync complete')
}
