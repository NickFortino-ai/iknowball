import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

// Cheap "is there anything to score?" check against our own games table,
// used to skip ESPN calls that cannot return anything useful.
//
// The DFS scoring jobs run on fixed cadences regardless of season — NBA
// every minute, WNBA and MLB every two. Each one hit ESPN's scoreboard
// BEFORE discovering whether the sport had games that day, so during the
// NBA offseason that was ~1,440 pointless requests a day, plus WNBA and
// MLB on top. That volume is a plausible reason ESPN started 403'ing this
// server on 2026-08-26.
//
// One indexed count against Postgres is far cheaper than an ESPN round
// trip, and our games table is the same source the rest of the app trusts
// for what's on today.
//
// Deliberately fails OPEN: if the check itself errors we return true so the
// caller still asks ESPN. A scoring job silently skipping real games would
// be much worse than a wasted request.
export async function hasGamesOnDate(sportKey, date) {
  try {
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('key', sportKey)
      .maybeSingle()
    if (!sport?.id) return true

    // games.starts_at is a timestamptz; compare against the full UTC day.
    // Widened by 12h on each side so a late West Coast game whose local
    // date differs from its UTC date still counts — this guard only needs
    // to answer "is this sport plausibly active", not pin an exact slate.
    const start = new Date(`${date}T00:00:00Z`)
    const end = new Date(`${date}T00:00:00Z`)
    start.setUTCHours(start.getUTCHours() - 12)
    end.setUTCHours(end.getUTCHours() + 36)

    const { count, error } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('sport_id', sport.id)
      .gte('starts_at', start.toISOString())
      .lte('starts_at', end.toISOString())

    if (error) throw error
    return (count || 0) > 0
  } catch (err) {
    logger.warn({ err: err.message, sportKey, date }, 'hasGamesOnDate check failed — assuming games exist')
    return true
  }
}
