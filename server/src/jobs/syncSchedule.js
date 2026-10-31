import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { todaySportsDay, addDaysSportsDay } from '../utils/sportsDay.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

// The `games` table was never a schedule. Every row in it came from the Odds
// API `/odds` endpoint, which returns only events bookmakers are currently
// PRICING — a few days out, plus a scattering of marquee games priced early.
// So the NBA schedule jumped Oct 31 -> Nov 13 -> Nov 20 -> Dec 25, which is
// the shape of a betting board, not a calendar.
//
// This fills the calendar from ESPN and leaves pricing to syncOdds. The two
// meet without colliding because syncOdds already dedupes on
// (sport, home_team, away_team, +/-2h) and ADOPTS the Odds API event id onto
// whatever row it finds — so a row seeded here is adopted and priced rather
// than duplicated.
const SPORTS = {
  basketball_nba: { espnPath: 'basketball/nba' },
}

/**
 * Teams have to be written under the name the ODDS feed uses, because that is
 * what syncOdds matches on, and the two feeds disagree: ESPN says
 * "LA Clippers" where the Odds API says "Los Angeles Clippers". Seeding
 * ESPN's spelling would slip straight past the dedupe and create the parallel
 * row this job exists to avoid.
 *
 * The map is built from rows we already hold rather than hardcoded, so it
 * stays correct if either feed renames a team. Keyed on the nickname (last
 * word) as well as the full name; ambiguous nicknames are dropped rather than
 * guessed — MLB's two Sox would collide, and a wrong team is worse than a
 * missing game.
 */
async function buildTeamResolver(sportId) {
  const { data } = await supabase
    .from('games')
    .select('home_team, away_team')
    .eq('sport_id', sportId)
    .limit(1000)
  const canonical = new Set()
  for (const g of data || []) {
    if (g.home_team) canonical.add(g.home_team)
    if (g.away_team) canonical.add(g.away_team)
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
  const byFull = new Map()
  const byNick = new Map()
  const nickCount = new Map()
  for (const name of canonical) {
    byFull.set(norm(name), name)
    const nick = norm(name).split(' ').pop()
    nickCount.set(nick, (nickCount.get(nick) || 0) + 1)
    byNick.set(nick, name)
  }
  for (const [nick, n] of nickCount) if (n > 1) byNick.delete(nick)

  return (espnName) => {
    const n = norm(espnName)
    if (byFull.has(n)) return byFull.get(n)
    const nick = n.split(' ').pop()
    return byNick.get(nick) || null
  }
}

export async function syncSchedule({ sportKey = 'basketball_nba', daysAhead = 14, dryRun = false } = {}) {
  const cfg = SPORTS[sportKey]
  if (!cfg) throw new Error(`syncSchedule: unsupported sport ${sportKey}`)

  const { data: sport } = await supabase.from('sports').select('id').eq('key', sportKey).single()
  if (!sport) throw new Error(`syncSchedule: sport ${sportKey} not found`)

  const resolveTeam = await buildTeamResolver(sport.id)
  const today = todaySportsDay()
  const inserted = []
  const skippedExisting = []
  const unresolved = []

  for (let i = 0; i <= daysAhead; i++) {
    const day = addDaysSportsDay(today, i)
    const dateStr = day.replace(/-/g, '')
    let events = []
    try {
      const res = await fetch(`${ESPN_BASE}/${cfg.espnPath}/scoreboard?dates=${dateStr}`)
      if (!res.ok) { logger.warn({ day, status: res.status }, 'syncSchedule: ESPN returned non-OK'); continue }
      events = (await res.json()).events || []
    } catch (err) {
      logger.warn({ err: err.message, day }, 'syncSchedule: ESPN fetch failed')
      continue
    }

    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const home = comp.competitors?.find((c) => c.homeAway === 'home')?.team?.displayName
      const away = comp.competitors?.find((c) => c.homeAway === 'away')?.team?.displayName
      const startsAt = event.date
      if (!home || !away || !startsAt) continue

      const homeName = resolveTeam(home)
      const awayName = resolveTeam(away)
      if (!homeName || !awayName) {
        // Never guess. An unresolved name would be written as a new team and
        // show up as a duplicate game the moment odds arrive.
        unresolved.push(`${away} @ ${home}`)
        continue
      }

      // Same +/-2h matchup window syncOdds uses, so the two jobs agree on
      // what "already have this game" means. Tight on purpose: MLB
      // doubleheaders are separate rows.
      const ms = new Date(startsAt).getTime()
      const { data: existing } = await supabase
        .from('games')
        .select('id')
        .eq('sport_id', sport.id)
        .eq('home_team', homeName)
        .eq('away_team', awayName)
        .gte('starts_at', new Date(ms - 2 * 60 * 60 * 1000).toISOString())
        .lte('starts_at', new Date(ms + 2 * 60 * 60 * 1000).toISOString())
        .limit(1)
      if (existing?.length) { skippedExisting.push(`${awayName} @ ${homeName}`); continue }

      const row = {
        // Prefixed so it can never collide with an Odds API id. syncOdds
        // overwrites it with the real event id when the game gets priced.
        external_id: `espn:${event.id}`,
        sport_id: sport.id,
        home_team: homeName,
        away_team: awayName,
        starts_at: startsAt,
        status: 'upcoming',
      }
      if (!dryRun) {
        const { error } = await supabase.from('games').insert(row)
        if (error) { logger.warn({ error: error.message, matchup: `${awayName} @ ${homeName}` }, 'syncSchedule: insert failed'); continue }
      }
      inserted.push(`${day}  ${awayName} @ ${homeName}`)
    }
  }

  logger.info({ sportKey, daysAhead, inserted: inserted.length, skippedExisting: skippedExisting.length, unresolved: unresolved.length, dryRun },
    'Schedule sync complete')
  return { inserted, skippedExisting, unresolved }
}
