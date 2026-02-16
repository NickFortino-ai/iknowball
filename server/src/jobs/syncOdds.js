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

  // Check: Any upcoming games within the next 7 days?
  // If none, still call the API once a day to discover new season games.
  const { count: upcomingCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)
    .eq('status', 'upcoming')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', sevenDaysFromNow.toISOString())

  if (upcomingCount === 0) {
    // Check when we last synced any game for this sport
    const { data: lastGame } = await supabase
      .from('games')
      .select('updated_at')
      .eq('sport_id', sport.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    const lastSync = lastGame ? new Date(lastGame.updated_at) : null
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    if (lastSync && lastSync > oneDayAgo) {
      logger.debug({ sportKey }, 'No upcoming games within 7 days and synced recently, skipping')
      return 0
    }

    logger.info({ sportKey }, 'No upcoming games within 7 days, checking API for new games')
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
