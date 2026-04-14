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

    // Dedupe by team+date BEFORE upserting by external_id. The Odds API
    // sometimes returns two different events for the same matchup with
    // slightly-different commence_times (data corruption upstream). If we
    // already have a game between the same teams within ±2h, treat them
    // as the same game and reuse that row's external_id — never create a
    // parallel row that would later show up as a duplicate on the picks
    // board.
    //
    // Window is intentionally tight (±2h, NOT ±20h) so MLB doubleheaders
    // — two games same day, typically 3-5h apart — stay as separate rows.
    // A wider window collapsed game 2 of a doubleheader into game 1's row,
    // and when game 1 finished the row got finalized with game 1's score,
    // settling parlay legs the user had placed on game 2.
    const startMs = new Date(event.commence_time).getTime()
    const lo = new Date(startMs - 2 * 60 * 60 * 1000).toISOString()
    const hi = new Date(startMs + 2 * 60 * 60 * 1000).toISOString()
    const { data: siblingMatches } = await supabase
      .from('games')
      .select('id, external_id, status, starts_at')
      .eq('sport_id', sport.id)
      .eq('home_team', event.home_team)
      .eq('away_team', event.away_team)
      .gte('starts_at', lo)
      .lte('starts_at', hi)
    const sibling = (siblingMatches || []).find((s) => s.external_id !== event.id)
    if (sibling) {
      // A row already exists for this matchup under a different external_id.
      // If that sibling is non-upcoming, the game has been settled — drop
      // this duplicate event entirely.
      if (sibling.status !== 'upcoming') {
        logger.warn({ eventId: event.id, siblingId: sibling.id, status: sibling.status }, 'Skipping duplicate event for already-settled game')
        continue
      }
      // Sibling is also upcoming — keep the older row, update its odds &
      // start time, and skip creating a new one.
      await supabase
        .from('games')
        .update({
          starts_at: event.commence_time,
          home_odds: homeOutcome?.price || null,
          away_odds: awayOutcome?.price || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sibling.id)
      upserted++
      continue
    }

    // No sibling — proceed with normal upsert by external_id.
    // Check if game already exists and has started — don't overwrite pre-game odds.
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

  // Prune orphaned upcoming rows: the Odds API sometimes reassigns an
  // event to a new external_id when a game's time changes. The old row
  // survives with its outdated starts_at because nothing updates it —
  // resulting in duplicate matchups appearing on different days.
  //
  // After processing the current API response, find upcoming games for
  // this sport within the API's reasonable horizon (8 days) whose
  // external_id isn't in today's event list. Those are phantoms. Delete
  // only those with no downstream dependencies (picks/parlay legs/league
  // picks) to stay safe; log warnings for any dependency-bearing phantoms
  // so admins can resolve manually.
  const seenExternalIds = new Set(events.map((e) => e.id))
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
  const { data: candidates } = await supabase
    .from('games')
    .select('id, external_id, home_team, away_team, starts_at')
    .eq('sport_id', sport.id)
    .eq('status', 'upcoming')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', horizon.toISOString())

  const orphans = (candidates || []).filter((g) => !seenExternalIds.has(g.external_id))
  for (const orphan of orphans) {
    // Check for dependent records
    const [picksRes, legsRes, leaguePicksRes] = await Promise.all([
      supabase.from('picks').select('id', { count: 'exact', head: true }).eq('game_id', orphan.id),
      supabase.from('parlay_legs').select('id', { count: 'exact', head: true }).eq('game_id', orphan.id),
      supabase.from('league_picks').select('id', { count: 'exact', head: true }).eq('game_id', orphan.id),
    ])
    const totalDeps = (picksRes.count || 0) + (legsRes.count || 0) + (leaguePicksRes.count || 0)

    if (totalDeps > 0) {
      logger.warn({
        sportKey,
        gameId: orphan.id,
        matchup: `${orphan.away_team} @ ${orphan.home_team}`,
        startsAt: orphan.starts_at,
        picks: picksRes.count,
        parlayLegs: legsRes.count,
        leaguePicks: leaguePicksRes.count,
      }, 'Orphaned game has picks — admin must resolve manually')
      continue
    }

    const { error: delErr } = await supabase.from('games').delete().eq('id', orphan.id)
    if (delErr) {
      logger.error({ err: delErr, gameId: orphan.id }, 'Failed to delete orphan game')
    } else {
      logger.info({
        sportKey,
        matchup: `${orphan.away_team} @ ${orphan.home_team}`,
        startsAt: orphan.starts_at,
      }, 'Pruned orphaned upcoming game (external_id no longer in API response)')
    }
  }

  return { sport: sportKey, status: 'ok', apiEvents: events.length, synced: upserted, pruned: orphans.length }
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
