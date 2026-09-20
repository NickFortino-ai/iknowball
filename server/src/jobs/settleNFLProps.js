import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { settleProps } from '../services/propService.js'
import { getCurrentNflWeek } from '../services/tdPassService.js'
import { stripAccents } from '../utils/name.js'
import { fetchAll } from '../utils/fetchAll.js'

// Map prop market_key → actual value from an nfl_player_stats row (Sleeper
// weekly stats). Keep in sync with the NFL branch of
// enrichLockedPicksWithLiveStats in propService.js.
const MARKET_STAT_MAP = {
  player_pass_yds: (s) => s.pass_yd,
  player_pass_tds: (s) => s.pass_td,
  player_pass_completions: (s) => s.pass_cmp,
  player_pass_attempts: (s) => s.pass_att,
  player_pass_interceptions: (s) => s.pass_int,
  player_rush_yds: (s) => s.rush_yd,
  player_rush_attempts: (s) => s.rush_att,
  player_reception_yds: (s) => s.rec_yd,
  player_receptions: (s) => s.rec,
  // Anytime TD = ANY touchdown the player scored, excluding passing TDs
  // (those are their own market). Books count returns — a WR who scores
  // only on a punt return still cashes an OVER on anytime_td 0.5.
  // return_td is Sleeper's aggregate of kick/punt/INT/fumble return TDs
  // (see syncWeeklyStats).
  player_anytime_td: (s) => (s.rush_td || 0) + (s.rec_td || 0) + (s.return_td || 0),
}

function normalizePlayerName(name) {
  // stripAccents FIRST so diacritics collapse to their ASCII base
  // (é→e, ć→c, ñ→n) before the [^a-z\s] regex would otherwise strip
  // them entirely. Without this, Sleeper's "Ekéler" normalized to
  // "ekler" while Odds-API's "Ekeler" normalized to "ekeler" — silent
  // mismatch, prop never settles.
  return stripAccents(name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Same normalization with any generational suffix removed.
 *
 * The odds feed writes "Kenneth Walker III" and "Brian Robinson Jr." where
 * nfl_players has the bare surname. The lookup below then found no stats row
 * and skipped the prop — so it stayed locked with a null actual_value
 * FOREVER, and whoever picked it had points neither won nor lost. 16 props on
 * already-final games were stuck this way.
 *
 * Tried only after the exact form, since some stored names do keep a suffix.
 */
function normalizeWithoutSuffix(name) {
  return normalizePlayerName(String(name || '').replace(/\s+(?:jr|sr|ii|iii|iv|v)\.?$/i, ''))
}

/**
 * Auto-settle NFL player props from Sleeper weekly stats (nfl_player_stats).
 * Unlike the daily NBA/MLB/WNBA jobs, NFL stats are weekly — keyed by
 * (player_id, season, week), not game_date — so we look up the current NFL
 * week's stats and match props by player name. A prop whose game is final
 * but whose player has no weekly stats row yet is left for a later tick
 * (could be mid-sync) rather than force-pushed.
 */
export async function settleNFLProps() {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'americanfootball_nfl')
    .single()
  if (!sport) return

  const { data: props, error } = await supabase
    .from('player_props')
    .select('id, player_name, market_key, line, game_id, games!inner(id, status, starts_at)')
    .eq('sport_id', sport.id)
    .in('status', ['locked', 'published'])
    .eq('games.status', 'final')
    .limit(200)

  if (error) {
    logger.error({ error }, 'Failed to fetch unsettled NFL props')
    return
  }
  if (!props?.length) return

  const { season, week } = await getCurrentNflWeek()

  // Settle each prop against ITS OWN week, not the current one.
  //
  // The stats read was pinned to getCurrentNflWeek(), so a prop had exactly
  // one week in which it could ever settle. Anything missed in that window —
  // a stats sync that landed late, a name that did not match — was stranded
  // permanently: the prop query above is not week-scoped, so it kept being
  // selected, kept finding no stats, and kept being skipped. All 60 stuck
  // props are week 1 while the current week is 2.
  //
  // game_date is an ET calendar date and starts_at is a UTC instant, so the
  // conversion goes through ET; slicing the UTC string would push every night
  // game a day late and into the wrong week.
  const { data: schedule } = await supabase
    .from('nfl_schedule')
    .select('week, game_date')
    .eq('season', season)
  const weekByEtDate = {}
  for (const row of schedule || []) {
    if (row.game_date) weekByEtDate[row.game_date] = row.week
  }
  // Returns null when the prop's week can't be established. Deliberately NOT
  // falling back to the current week: guessing is how a prop would grade
  // against a week it has nothing to do with, which is worse than waiting.
  // A null here simply skips the prop this tick.
  const weekForProp = (prop) => {
    const startsAt = prop.games?.starts_at
    if (!startsAt) return null
    const etDay = new Date(startsAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    return weekByEtDate[etDay] ?? null
  }
  const weeksNeeded = [...new Set((props || []).map(weekForProp).filter((w) => w != null))]
  if (!weeksNeeded.length) return

  // Pull this week's stats joined to player names so we can match props
  // (which only carry player_name) without a separate id map.
  // fetchAll: a full NFL week passed 1,600 stat rows on the first real
  // Sunday, and Supabase silently caps an unpaginated select at 1,000. Props
  // for anyone beyond the cut simply never settled — games final, picks
  // locked, actual_value null — with no error to show for it. Worse, without
  // an explicit sort the rows Postgres returns are arbitrary, so WHICH
  // players fell outside the cap changed between runs: Jahmyr Gibbs resolved
  // in one pass and vanished in the next.
  const stats = await fetchAll(
    supabase
      .from('nfl_player_stats')
      .select('player_id, week, pass_yd, pass_td, pass_cmp, pass_att, pass_int, rush_yd, rush_att, rec, rec_yd, rec_td, rush_td, return_td, nfl_players!inner(full_name)')
      .eq('season', season)
      .in('week', weeksNeeded)
      .order('player_id', { ascending: true }),
  )

  if (!stats?.length) return

  // Which weeks we actually hold stats for — distinguishes "sync hasn't run"
  // from "this player didn't play" below.
  const weeksWithStats = new Set(stats.map((s) => s.week))

  // Keyed by week as well as name: more than one week of stats is in play now,
  // and a week-1 prop must never grade against a week-2 line.
  const statsByName = {}
  const statsBySuffixless = {}
  for (const s of stats) {
    const name = s.nfl_players?.full_name
    if (!name) continue
    statsByName[`${s.week}|${normalizePlayerName(name)}`] = s
    const bare = `${s.week}|${normalizeWithoutSuffix(name)}`
    if (!(bare in statsBySuffixless)) statsBySuffixless[bare] = s
  }

  const settlements = []
  for (const prop of props) {
    const statFn = MARKET_STAT_MAP[prop.market_key]
    if (!statFn) continue // unsupported market

    const propWeek = weekForProp(prop)
    if (propWeek == null) continue // week unknown — never guess
    const s = statsByName[`${propWeek}|${normalizePlayerName(prop.player_name)}`]
      || statsBySuffixless[`${propWeek}|${normalizeWithoutSuffix(prop.player_name)}`]

    if (!s) {
      // No stats row means one of two very different things, and the old code
      // treated both as "wait": either the sync for that week hasn't landed,
      // or the player was inactive and never will have a row. The second case
      // left the prop locked forever with the pick neither won nor lost.
      //
      // weeksWithStats tells them apart. If we hold stats for OTHER players
      // that week, the sync has run and this player simply didn't play.
      //
      // Settled as a push with a null actualValue, which is the exact signal
      // settleProps already looks for: it returns the risked points and sends
      // the "didn't play — your pick was pushed" notification. That path was
      // built and wired for the other sports; NFL just never reached it.
      if (weeksWithStats.has(propWeek)) {
        settlements.push({ propId: prop.id, outcome: 'push', actualValue: null })
      }
      continue
    }

    const actualValue = statFn(s) || 0
    let outcome
    if (actualValue > prop.line) outcome = 'over'
    else if (actualValue < prop.line) outcome = 'under'
    else outcome = 'push'

    settlements.push({ propId: prop.id, outcome, actualValue })
  }

  if (!settlements.length) return

  const results = await settleProps(settlements)
  const totalScored = results.reduce((sum, r) => sum + (r.scored || 0), 0)
  logger.info({ settled: settlements.length, picksScored: totalScored, season, week }, 'Auto-settled NFL player props')
}
