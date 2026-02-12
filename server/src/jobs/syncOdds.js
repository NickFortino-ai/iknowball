import { supabase } from '../config/supabase.js'
import { fetchOdds } from '../services/oddsService.js'
import { logger } from '../utils/logger.js'

export async function syncOdds() {
  logger.info('Starting odds sync...')

  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'americanfootball_nfl')
    .single()

  if (!sport) {
    logger.error('NFL sport not found in database')
    return
  }

  let events
  try {
    events = await fetchOdds('americanfootball_nfl')
  } catch (err) {
    logger.error({ err }, 'Failed to fetch odds')
    return
  }

  logger.info({ count: events.length }, 'Fetched events from Odds API')

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

  logger.info({ upserted, total: events.length }, 'Odds sync complete')
}
