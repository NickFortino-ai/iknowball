import { supabase } from '../config/supabase.js'
import { fetchOdds } from '../services/oddsService.js'
import { logger } from '../utils/logger.js'

async function syncSport(sportKey, { force = false } = {}) {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sportKey)
    .single()

  if (!sport) {
    logger.warn({ sportKey }, 'Sport not found in database, skipping')
    return { sport: sportKey, status: 'not_in_db', synced: 0 }
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

  if (upcomingCount === 0 && !force) {
    // Check when we last synced any game for this sport
    const { data: lastGame } = await supabase
      .from('games')
      .select('updated_at')
      .eq('sport_id', sport.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    const lastSync = lastGame ? new Date(lastGame.updated_at) : null
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)

    if (lastSync && lastSync > fourHoursAgo) {
      logger.debug({ sportKey }, 'No upcoming games within 7 days and synced within 4h, skipping')
      return { sport: sportKey, status: 'skipped_recent', synced: 0 }
    }

    logger.info({ sportKey }, 'No upcoming games within 7 days, checking API for new games')
  }

  let events
  try {
    events = await fetchOdds(sportKey)
  } catch (err) {
    logger.error({ err, sportKey }, 'Failed to fetch odds')
    return { sport: sportKey, status: 'api_error', error: err.message, synced: 0 }
  }

  logger.info({ sportKey, count: events.length }, 'Fetched events from Odds API')

  if (events.length === 0) {
    return { sport: sportKey, status: 'no_events', synced: 0 }
  }

  let upserted = 0
  for (const event of events) {
    const bookmaker = event.bookmakers?.[0]
    const h2hMarket = bookmaker?.markets?.find((m) => m.key === 'h2h')
    const outcomes = h2hMarket?.outcomes || []

    const homeOutcome = outcomes.find((o) => o.name === event.home_team)
    const awayOutcome = outcomes.find((o) => o.name === event.away_team)

    // Skip events with no odds — these are typically bad duplicates from the API
    if (!homeOutcome?.price && !awayOutcome?.price) {
      continue
    }

    // Check if game already exists and has started — don't overwrite pre-game odds
    const { data: existing } = await supabase
      .from('games')
      .select('id, status')
      .eq('external_id', event.id)
      .maybeSingle()

    if (existing && existing.status !== 'upcoming') {
      // Game already started or finished — skip to preserve original odds
      continue
    }

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

  return { sport: sportKey, status: 'ok', apiEvents: events.length, synced: upserted }
}

export async function syncOdds({ force = false } = {}) {
  logger.info({ force }, 'Starting odds sync...')

  const sports = ['americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'basketball_ncaab', 'basketball_wncaab', 'americanfootball_ncaaf', 'basketball_wnba', 'icehockey_nhl', 'soccer_usa_mls']
  const results = []

  for (const sportKey of sports) {
    const result = await syncSport(sportKey, { force })
    results.push(result)
  }

  const total = results.reduce((sum, r) => sum + r.synced, 0)
  logger.info({ total }, 'Odds sync complete')

  return results
}
