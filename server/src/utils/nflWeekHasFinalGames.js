import { supabase } from '../config/supabase.js'
import { logger } from './logger.js'

// Has any NFL game for this week/season certainly finished?
//
// Used only to qualify the "no player stats" abort in the two NFL scorers.
// Without it, any scoring tick BEFORE the week's first kickoff would see an
// empty nfl_player_stats — legitimately — and fire an abort plus an admin
// email on every run from Tuesday through Thursday.
//
// Reads nfl_schedule, NOT games: games.season / games.week are null for every
// NFL row, so a (season, week) filter there matches nothing and this check
// would always say "no", permanently disarming the guard.
//
// Two signals, deliberately:
//   status === 'complete'  — accurate, but written from SLEEPER, so in the
//                            exact outage this guard exists to catch it would
//                            be stuck on 'scheduled'. Can't be the only test.
//   game_date < today (ET) — the schedule is loaded once, months ahead, so
//                            the dates survive a Sleeper outage. A calendar
//                            date strictly before today in ET is over.
//
// The date rule lags by up to a day (a Sunday game only counts as past from
// Monday ET), so during an outage the alert can arrive a day late. That's
// acceptable: the primary protection — refusing to persist zeros — does not
// depend on this function at all. Only the alerting does.
//
// Fails CLOSED, returning true when it cannot tell. The only caller has
// already established that player stats are missing; treating unknown as
// "the week has started" means we refuse to write and alert a human, which
// is the safe direction.
export async function nflWeekHasFinalGames(week, season) {
  try {
    const { data, error } = await supabase
      .from('nfl_schedule')
      .select('status, game_date')
      .eq('season', season)
      .eq('week', week)
    if (error) throw error
    if (!data?.length) {
      // No schedule rows for this week at all — can't judge, so fail closed.
      logger.warn({ week, season }, 'nfl_schedule has no rows for this week — assuming it HAS started')
      return true
    }

    // en-CA formats as YYYY-MM-DD, which sorts and compares directly against
    // nfl_schedule.game_date (a plain DATE column, in ET terms).
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    return data.some((g) => g.status === 'complete' || (g.game_date && g.game_date < todayET))
  } catch (err) {
    logger.warn({ err: err.message, week, season }, 'nflWeekHasFinalGames check failed — assuming the week HAS started')
    return true
  }
}
