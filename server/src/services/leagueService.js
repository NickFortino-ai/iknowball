import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createTournament, getBracketStandings } from './bracketService.js'
import { getLeaguePickStandings } from './leaguePickService.js'
import { toSportsDay } from '../utils/sportsDay.js'

/**
 * Check whether a league is still joinable based on its format and start date.
 * For most formats: allow joining until the last game on the start date kicks off.
 * For traditional fantasy: allow joining until draft starts.
 * For bracket: allow joining until bracket locks.
 * Throws with a 400 error if joining is no longer allowed.
 */
export async function assertLeagueJoinable(league) {
  if (league.status === 'completed') {
    const err = new Error('This league is no longer accepting members')
    err.status = 400
    throw err
  }

  // Traditional fantasy: draft-based join logic
  if (league.format === 'fantasy') {
    const { data: fs } = await supabase
      .from('fantasy_settings')
      .select('draft_status, format')
      .eq('league_id', league.id)
      .maybeSingle()

    if (fs?.format === 'salary_cap') {
      // NFL salary cap falls through to last-game-on-start-date logic below
    } else {
      // Traditional: allow joining until draft starts
      if (fs && fs.draft_status !== 'pending') {
        const err = new Error('This league\'s draft has already started')
        err.status = 400
        throw err
      }
      return // joinable
    }
  }

  // Bracket: allow joining until bracket locks
  if (league.format === 'bracket') {
    const { data: tournament } = await supabase
      .from('bracket_tournaments')
      .select('locks_at, status')
      .eq('league_id', league.id)
      .single()

    if (tournament && new Date(tournament.locks_at) <= new Date()) {
      const err = new Error('This bracket is locked and no longer accepting entries')
      err.status = 400
      throw err
    }
    return // joinable
  }

  // Squares: a squares league is tied to a specific game. Allow joining
  // until either (a) the linked game kicks off, or (b) all 100 squares
  // are claimed.
  if (league.format === 'squares') {
    const { data: board } = await supabase
      .from('squares_boards')
      .select('id, game_id, games(starts_at)')
      .eq('league_id', league.id)
      .maybeSingle()

    if (board?.id) {
      const gameStart = board.games?.starts_at
      if (gameStart && new Date(gameStart) <= new Date()) {
        const err = new Error("The game's underway — this squares league is closed to new members")
        err.status = 400
        throw err
      }

      const { count: claimCount } = await supabase
        .from('squares_claims')
        .select('id', { count: 'exact', head: true })
        .eq('board_id', board.id)

      if ((claimCount || 0) >= 100) {
        const err = new Error('This squares board is full — all 100 squares are taken')
        err.status = 400
        throw err
      }

      return // joinable until kickoff or full
    }

    // Fallback: no board linked yet — use starts_at if set
    if (league.starts_at && new Date(league.starts_at) <= new Date()) {
      const err = new Error('This league has already started')
      err.status = 400
      throw err
    }
    return // joinable
  }

  // Survivor: join-gate. Users can join until the LAST game of the FIRST
  // period kicks off — same rule other formats use for their start day.
  // Mid-Day-1 joiners can still pick a game that hasn't started yet.
  //
  // Fairness note: autoEliminateMissedPicks skips members whose joined_at
  // is after the period's starts_at, so a mid-Day-1 joiner who doesn't
  // pick gets a Day-1 free pass. Accepted as a small welcome-to-the-pool
  // leniency limited to the first period — after that, all subsequent
  // periods start with the joiner already in, so no immunity accrues.
  if (league.format === 'survivor') {
    const { data: firstPeriod } = await supabase
      .from('league_weeks')
      .select('starts_at, ends_at')
      .eq('league_id', league.id)
      .order('week_number', { ascending: true })
      .limit(1)
      .maybeSingle()
    const firstStart = firstPeriod?.starts_at || league.starts_at
    const firstEnd = firstPeriod?.ends_at
    const now = new Date()

    // First period hasn't started yet — always joinable.
    if (firstStart && new Date(firstStart) > now) return

    // First period has started — need to check whether the last game of
    // the period is still upcoming. Missing ends_at → fall back to the
    // strict pre-period gate.
    const sportKey = league.sport
    if (!firstEnd) {
      const err = new Error('This survivor pool has already started — no new members can join')
      err.status = 400
      throw err
    }

    // Resolve sport_id when the league is single-sport. 'all' is a
    // synthetic multi-sport pool — no matching row in the sports table;
    // we query games across every sport in that case.
    let sportIdFilter = null
    if (sportKey && sportKey !== 'all') {
      const { data: sportRow } = await supabase.from('sports').select('id').eq('key', sportKey).single()
      if (!sportRow) {
        const err = new Error('This survivor pool has already started — no new members can join')
        err.status = 400
        throw err
      }
      sportIdFilter = sportRow.id
    }

    let gameQuery = supabase
      .from('games')
      .select('starts_at')
      .gte('starts_at', firstStart)
      .lt('starts_at', firstEnd)
      .order('starts_at', { ascending: false })
      .limit(1)
    if (sportIdFilter) gameQuery = gameQuery.eq('sport_id', sportIdFilter)

    const { data: periodGames } = await gameQuery

    const lastGame = periodGames?.[0]
    if (lastGame && new Date(lastGame.starts_at) > now) return // still time to join

    const err = new Error('This survivor pool has already started — no new members can join')
    err.status = 400
    throw err
  }

  // All other formats (pickem, nba_dfs, mlb_dfs, hr_derby, td_pass, salary_cap fantasy):
  // Allow joining until the last game on the start date kicks off.
  if (!league.starts_at) return // no start date = always joinable

  const startDate = new Date(league.starts_at)
  const now = new Date()

  // If start date is in the future, always joinable
  if (startDate > now) return

  // Start date has arrived or passed — check if the last game on that date has kicked off
  const sportKey = league.sport
  if (!sportKey) {
    // No sport means no games to check — fall back to simple starts_at check
    if (startDate <= now) {
      const err = new Error('This league has already started')
      err.status = 400
      throw err
    }
    return
  }

  const { data: sportRow } = await supabase.from('sports').select('id').eq('key', sportKey).single()
  if (!sportRow) {
    if (startDate <= now) {
      const err = new Error('This league has already started')
      err.status = 400
      throw err
    }
    return
  }

  // Find games played on the start date's PT calendar day. Anchor to PT
  // (not ET) because a 10pm PT game lives on the PT-current day but the
  // NEXT ET day, and would be excluded from an ET-bound window.
  const dateStr = toSportsDay(startDate)
  // Wide UTC window covering this PT day (PST=UTC-8, PDT=UTC-7), then
  // filter precisely with toSportsDay below.
  const dayStartUtc = new Date(`${dateStr}T06:00:00Z`)
  const dayEndUtc = new Date(`${dateStr}T00:00:00Z`)
  dayEndUtc.setUTCDate(dayEndUtc.getUTCDate() + 1)
  dayEndUtc.setUTCHours(14)

  const { data: dayGames } = await supabase
    .from('games')
    .select('starts_at')
    .eq('sport_id', sportRow.id)
    .gte('starts_at', dayStartUtc.toISOString())
    .lt('starts_at', dayEndUtc.toISOString())
    .order('starts_at', { ascending: false })

  const lastGame = (dayGames || []).find((g) => toSportsDay(g.starts_at) === dateStr) || null

  if (lastGame) {
    // Allow joining until the last game kicks off
    if (new Date(lastGame.starts_at) <= now) {
      const err = new Error('Games have started — this league is no longer accepting members')
      err.status = 400
      throw err
    }
    return // last game hasn't started yet — still joinable
  }

  // No games found on the start date — fall back to starts_at
  if (startDate <= now) {
    const err = new Error('This league has already started')
    err.status = 400
    throw err
  }
}

// REGULAR-season end dates by sport. Full-season leagues end AFTER the
// last day of the regular season's games (NO playoffs). Returns a Date
// at 10 AM UTC the day AFTER the last game day, so all West Coast night
// games on the final day finish before the league closes.
function regularSeasonEnd(sportKey, startsAt) {
  if (!sportKey) return null
  // [month0, day] of the last regular-season game day
  const endMd = {
    basketball_nba: [3, 12],         // Apr 12
    americanfootball_nfl: [0, 5],    // Jan 5
    baseball_mlb: [8, 29],           // Sep 29
    basketball_ncaab: [2, 8],        // Mar 8
    basketball_wncaab: [2, 8],
    americanfootball_ncaaf: [11, 7], // Dec 7
    basketball_wnba: [8, 14],        // Sep 14
    icehockey_nhl: [3, 18],          // Apr 18
    soccer_usa_mls: [9, 18],         // Oct 18
  }[sportKey]
  if (!endMd) return null
  const start = startsAt ? new Date(startsAt) : new Date()
  let year = start.getUTCFullYear()
  // Build end-of-last-day-plus-one in UTC, matching parseEndDate convention
  let candidate = new Date(Date.UTC(year, endMd[0], endMd[1] + 1, 10, 0, 0))
  if (candidate < start) {
    candidate = new Date(Date.UTC(year + 1, endMd[0], endMd[1] + 1, 10, 0, 0))
  }
  return candidate
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Returns { start, end } for the "this week" window containing `date`.
// Sport-aware anchor day: football (NFL/NCAAF/UFL) weeks run Tue → Mon so
// they align with MNF ending the week; everything else runs Mon → Sun.
// Both anchors resolve to PT calendar day, not UTC — a user creating a
// this_week league at 5 PM PT Sunday would previously land on UTC-Monday
// and get NEXT week's window. Bounds land on 10:00 UTC (= 3 AM PT) of the
// anchor day, matching the "end of sports day PT" storage convention used
// by parseEndDate + generateLeagueWeeks: end - start is exactly 7 days,
// so ends_at at 10 UTC next-anchor-day = end of prior day's PT sports day.
function getWeekBounds(date, sport) {
  const isFootball = sport === 'americanfootball_nfl'
    || sport === 'americanfootball_ncaaf'
    || sport === 'americanfootball_ufl'
  const anchorDay = isFootball ? 2 : 1 // 0=Sun, 1=Mon, 2=Tue

  const ptDateStr = new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const [y, m, d] = ptDateStr.split('-').map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d, 12)) // noon UTC of the PT day (dodges DST)
  const probeDay = probe.getUTCDay() // 0=Sun..6=Sat
  const daysBackToAnchor = (probeDay - anchorDay + 7) % 7
  probe.setUTCDate(probe.getUTCDate() - daysBackToAnchor)
  const anchorPtDate = probe.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const start = new Date(`${anchorPtDate}T10:00:00.000Z`)
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  return { start, end }
}

export async function createLeague(userId, data) {
  // Generate unique invite code
  let inviteCode
  for (let i = 0; i < 10; i++) {
    inviteCode = generateInviteCode()
    const { data: existing } = await supabase
      .from('leagues')
      .select('id')
      .eq('invite_code', inviteCode)
      .single()
    if (!existing) break
  }

  // Calculate date range based on duration
  // Append T12:00:00 to date-only strings to avoid UTC midnight → previous day shift
  function parseDate(str) {
    if (!str) return null
    if (str.length === 10) return new Date(str + 'T12:00:00') // date-only: YYYY-MM-DD
    return new Date(str)
  }

  // End dates use end-of-sports-day: next day 10:00 UTC (6 AM ET)
  // so all US evening/West Coast games on the selected date are included
  function parseEndDate(str) {
    if (!str) return null
    if (str.length === 10) {
      const d = new Date(str + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      d.setUTCHours(10, 0, 0, 0)
      return d
    }
    return new Date(str)
  }

  let startsAt = data.starts_at ? parseDate(data.starts_at) : new Date()
  let endsAt = data.ends_at ? parseEndDate(data.ends_at) : null

  if (data.duration === 'this_week') {
    const bounds = getWeekBounds(new Date(), data.sport)
    // starts_at stays as now (not Monday), so league stays open for invites
    endsAt = bounds.end
  } else if (data.duration === 'full_season') {
    // Sport-aware regular-season end. Falls back to +6mo for unknown sports.
    endsAt = endsAt || regularSeasonEnd(data.sport, startsAt) || (() => {
      const d = new Date(startsAt)
      d.setMonth(d.getMonth() + 6)
      return d
    })()
  } else if (data.duration === 'playoffs_only') {
    endsAt = new Date(startsAt)
    endsAt.setMonth(endsAt.getMonth() + 3)
  }

  // Bracket: default ends_at to the template's championship date if the
  // commissioner didn't pick one. Lets the league card show "Runs Jun 28
  // – Jul 19" instead of "Jun 28 – TBD" without each commissioner having
  // to know the date.
  if (!endsAt && data.format === 'bracket' && data.settings?.template_id) {
    const { data: tpl } = await supabase
      .from('bracket_templates')
      .select('ends_at')
      .eq('id', data.settings.template_id)
      .single()
    if (tpl?.ends_at) endsAt = new Date(tpl.ends_at)
  }

  // For custom ranges, keep noon UTC (safe for all US timezones)
  // No setHours — parseDate already gives noon which won't shift dates

  const { data: league, error } = await supabase
    .from('leagues')
    .insert({
      name: data.name,
      format: data.format,
      sport: data.sport,
      duration: data.duration,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() || null,
      invite_code: inviteCode,
      max_members: data.max_members || null,
      commissioner_id: userId,
      settings: data.settings || {},
      use_league_picks: data.format === 'pickem',
      visibility: data.visibility || 'closed',
      joins_locked_at: data.joins_locked_at
        ? (['nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point'].includes(data.format) && data.joins_locked_at.length === 10
          // For DFS / contest formats, date-only string → end of sports day (next day 10 AM UTC / 6 AM ET)
          ? (() => { const d = new Date(data.joins_locked_at + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(10, 0, 0, 0); return d.toISOString() })()
          : data.joins_locked_at)
        : null,
      backdrop_image: data.backdrop_image || null,
    })
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to create league')
    throw error
  }

  // Add commissioner as first member
  await supabase.from('league_members').insert({
    league_id: league.id,
    user_id: userId,
    role: 'commissioner',
    lives_remaining: league.settings?.lives || 1,
  })

  // Generate weeks
  await generateLeagueWeeks(league)

  // Create squares board if format is squares
  if (league.format === 'squares' && league.settings?.game_id) {
    await supabase.from('squares_boards').insert({
      league_id: league.id,
      game_id: league.settings.game_id,
      row_team_name: league.settings.row_team_name || 'Away',
      col_team_name: league.settings.col_team_name || 'Home',
    })
  }

  // Create bracket tournament if format is bracket
  if (league.format === 'bracket' && league.settings?.template_id) {
    await createTournament(league.id, league.settings.template_id, league.settings.locks_at)
  }

  // Create fantasy settings if format is fantasy
  // (also for single-stat contests so the commissioner can edit pick_reuse
  // via the gear icon — those routes read fantasy_settings.pick_reuse).
  const NEEDS_FANTASY_SETTINGS = ['fantasy', 'nba_dfs', 'mlb_dfs', 'wnba_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions']
  if (NEEDS_FANTASY_SETTINGS.includes(league.format)) {
    const { createFantasySettings } = await import('./fantasyService.js')
    await createFantasySettings(league.id, data.fantasy_settings || {})
  }

  // Guard: traditional fantasy is only creatable BEFORE the season opener
  // kicks off. Once the first Week 1 game has started, only Salary Cap is
  // available — late-start traditional leagues are weird and the draft
  // can't really happen anyway.
  if (league.format === 'fantasy' && data.fantasy_settings?.format !== 'salary_cap') {
    try {
      const { getSeasonOpenerKickoff } = await import('./tdPassService.js')
      const opener = await getSeasonOpenerKickoff()
      if (opener && new Date(opener).getTime() <= Date.now()) {
        await supabase.from('leagues').delete().eq('id', league.id)
        const err = new Error('Traditional fantasy can only be created before the NFL season opens. Use Salary Cap instead.')
        err.status = 400
        throw err
      }
    } catch (err) {
      if (err.status) throw err
      logger.warn({ err }, 'Could not verify season opener for traditional fantasy lock')
    }
  }

  // TD Pass: set starts_at to the first kickoff of the current NFL week
  // Football Survivor (NFL / NCAAF, standard or Touchdown mode): start at
  // the first kickoff of the upcoming week so the league doesn't appear
  // "already started" before games begin. Falls back to a season-start
  // placeholder if the schedule hasn't been loaded yet (offseason create).
  const isFootballSurvivor = league.format === 'survivor'
    && (league.sport === 'americanfootball_nfl' || league.sport === 'americanfootball_ncaaf')
  if (isFootballSurvivor) {
    try {
      let firstKickoff = null
      if (league.sport === 'americanfootball_nfl') {
        const { getCurrentWeekFirstKickoff } = await import('./tdPassService.js')
        firstKickoff = await getCurrentWeekFirstKickoff()
      } else {
        // NCAAF: find earliest upcoming game in the games table.
        const { data: sport } = await supabase
          .from('sports')
          .select('id')
          .eq('key', 'americanfootball_ncaaf')
          .single()
        if (sport?.id) {
          const { data: nextGames } = await supabase
            .from('games')
            .select('starts_at')
            .eq('sport_id', sport.id)
            .gt('starts_at', new Date().toISOString())
            .order('starts_at', { ascending: true })
            .limit(1)
          firstKickoff = nextGames?.[0]?.starts_at || null
        }
      }
      const nowMs = Date.now()
      const isFutureKickoff = firstKickoff && new Date(firstKickoff).getTime() > nowMs
      const startsAtMs = league.starts_at ? new Date(league.starts_at).getTime() : 0
      const updates = {}
      // Only override starts_at if the league's existing one is already in
      // the past or unset — don't stomp a user-chosen future start date.
      if (startsAtMs <= nowMs) {
        let newStartsAt = isFutureKickoff ? firstKickoff : null
        if (!newStartsAt) {
          // Offseason placeholder: sport-appropriate opener date.
          const today = new Date()
          const yr = today.getFullYear()
          const [openerMonth, openerDay] = league.sport === 'americanfootball_ncaaf'
            ? [7, 23]  // late-Aug college opener
            : [8, 9]   // early-Sept NFL opener
          const candidate = new Date(yr, openerMonth, openerDay)
          newStartsAt = (candidate > today ? candidate : new Date(yr + 1, openerMonth, openerDay)).toISOString()
        }
        updates.starts_at = newStartsAt
        league.starts_at = newStartsAt
      }
      // Joins close at the next kickoff. Letting late joiners in after
      // a game has already started would mean they're picking from a smaller
      // information-disadvantaged team pool. Skip if joins are already
      // locked to a future moment by the user.
      const existingLockMs = league.joins_locked_at ? new Date(league.joins_locked_at).getTime() : 0
      if (isFutureKickoff && existingLockMs <= nowMs) {
        updates.joins_locked_at = firstKickoff
        league.joins_locked_at = firstKickoff
      }
      if (Object.keys(updates).length) {
        await supabase.from('leagues').update(updates).eq('id', league.id)
      }
    } catch (err) {
      logger.error({ err, leagueId: league.id, sport: league.sport }, 'Failed to set football survivor starts_at / joins_locked_at')
    }
  }

  // NFL season-long contests start at the first kickoff of the upcoming/
  // current NFL week so the league doesn't appear "already started" while
  // members are being invited. In the offseason (no future kickoffs in
  // nfl_schedule yet), getCurrentWeekFirstKickoff falls back to the latest
  // known week — which is in the past — so we guard with a future check
  // and fall back to next September 1 as a placeholder until the schedule
  // is loaded.
  if (league.format === 'td_pass' || league.format === 'sacks' || league.format === 'ints' || league.format === 'tackles' || league.format === 'receptions') {
    try {
      const { getCurrentWeekLastKickoff, getCurrentWeekFirstKickoff } = await import('./tdPassService.js')
      const firstKickoff = await getCurrentWeekFirstKickoff()
      const nowMs = Date.now()
      const isFutureKickoff = firstKickoff && new Date(firstKickoff).getTime() > nowMs
      let resolvedStartsAt = isFutureKickoff ? firstKickoff : null
      if (!resolvedStartsAt) {
        // Offseason fallback: NFL kickoff date for the upcoming season.
        // 2026 regular season opens Sept 9, and that pattern (early-Sept
        // Wed/Thu kickoff) holds year-to-year — close enough as a
        // placeholder until the real schedule loads from Sleeper.
        const today = new Date()
        const yr = today.getFullYear()
        const candidate = new Date(yr, 8, 9) // Sept 9 (month index 8)
        resolvedStartsAt = (candidate > today ? candidate : new Date(yr + 1, 8, 9)).toISOString()
      }
      const updates = {}
      updates.starts_at = resolvedStartsAt
      league.starts_at = resolvedStartsAt
      // TD Pass auto-locks joins at the last kickoff of the current NFL
      // week (one shot per week — late joiners after kickoff have less
      // info than they should). Sacks + Ints stay open longer because
      // commissioners can plausibly want late joiners across the season,
      // so we leave joins_locked_at as the user-provided value.
      if (league.format === 'td_pass') {
        const lastKickoff = await getCurrentWeekLastKickoff()
        if (lastKickoff && new Date(lastKickoff).getTime() > nowMs) {
          updates.joins_locked_at = lastKickoff
          league.joins_locked_at = lastKickoff
        }
      }
      if (Object.keys(updates).length) {
        await supabase.from('leagues').update(updates).eq('id', league.id)
      }
    } catch (err) {
      logger.error({ err, leagueId: league.id, format: league.format }, 'Failed to set NFL contest start/lock dates')
    }
  }

  return league
}

export async function generateLeagueWeeks(league) {
  if (!league.starts_at) return

  const isDaily = league.settings?.pick_frequency === 'daily'
  const periods = []
  let periodNum = 1
  const current = new Date(league.starts_at)
  // Survivor "last one standing" leagues have no ends_at — generate enough
  // periods to cover the foreseeable horizon (1 year). extendLeagueWeeks
  // tops them up if a league runs longer.
  const end = league.ends_at
    ? new Date(league.ends_at)
    : new Date(new Date(league.starts_at).getTime() + 365 * 24 * 60 * 60 * 1000)

  // Periods that end before league.starts_at are backdated and dangerous —
  // the auto-eliminate cron would treat them as "Day 1 already happened" and
  // mark every member as missed-pick-eliminated for a day that never
  // existed. Skip any such period at insert time. Belt-and-suspenders alongside
  // the autoEliminateMissedPicks/scoreSurvivorPicks pre-start guards.
  const startsAtMs = new Date(league.starts_at).getTime()

  if (isDaily) {
    // Daily mode: one entry per PT calendar day. Period boundaries are
    // 10:00 UTC → 09:59 UTC the next day (= 3 AM PT → 2:59 AM PT, summer;
    // 2 AM PT → 1:59 AM PT, winter) so US evening games (including 10 PM
    // PT starts on the West Coast) attach to the correct calendar date.
    //
    // PT-DATE anchor: for a starts_at that lands 4-7 AM UTC (= 9-11 PM PT
    // the previous evening = 12-3 AM ET the same day), PT and ET disagree
    // on which calendar day is "day 1". Anchor to PT so late-evening West
    // Coast starts_at values snap to the intended PT day, not one day
    // forward. Also anchors day 1 to the calendar day of starts_at so a
    // commissioner who picks "May 17" gets May 17 games on day 1 — same
    // behavior as before for noon-UTC picks (the common case).
    const startPtDate = new Date(league.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    current.setTime(new Date(`${startPtDate}T10:00:00.000Z`).getTime())

    while (current < end) {
      const dayEnd = new Date(current)
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
      dayEnd.setUTCHours(9, 59, 59, 999)

      if (dayEnd.getTime() > startsAtMs) {
        periods.push({
          league_id: league.id,
          week_number: periodNum++,
          starts_at: current.toISOString(),
          ends_at: dayEnd.toISOString(),
        })
      }

      current.setUTCDate(current.getUTCDate() + 1)
    }
  } else {
    // Weekly mode: anchor day depends on sport.
    //   Football (NFL/NCAAF/UFL) → Tue-Mon, aligned with the NFL's own
    //     week (the week ends with Monday Night Football, then the next
    //     week starts Tuesday). Without this, MNF games land in the
    //     wrong week and survivor/pickem settle picks against the wrong
    //     period.
    //   Everything else → Mon-Sun calendar week.
    // Periods always run anchorDay 10 UTC → next anchorDay 09:59 UTC
    // (= 3 AM PT → 2:59 AM PT summer, safely past all US game finishes).
    // Anchor Week 1 to the anchorDay of the PT week containing
    // starts_at so a starts_at like Sun May 17 8 PM PT stays in the
    // PT week ending on that Sunday.
    const isFootball = league.sport === 'americanfootball_nfl'
      || league.sport === 'americanfootball_ncaaf'
      || league.sport === 'americanfootball_ufl'
    const anchorDay = isFootball ? 2 : 1 // 0=Sun, 1=Mon, 2=Tue
    const startPtDate = new Date(league.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    const [y, m, d] = startPtDate.split('-').map(Number)
    const probe = new Date(Date.UTC(y, m - 1, d, 12)) // noon UTC to dodge any DST boundary weirdness
    const probeDay = probe.getUTCDay() // 0=Sun..6=Sat
    const daysBackToAnchor = (probeDay - anchorDay + 7) % 7
    probe.setUTCDate(probe.getUTCDate() - daysBackToAnchor)
    const anchorPtDate = probe.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    current.setTime(new Date(`${anchorPtDate}T10:00:00.000Z`).getTime())

    while (current < end) {
      const weekEnd = new Date(current)
      weekEnd.setUTCDate(current.getUTCDate() + 7)
      weekEnd.setUTCHours(9, 59, 59, 999)

      if (weekEnd.getTime() > startsAtMs) {
        // Week 1 anchors to the anchor day (Mon or Tue) of the PT week
        // containing starts_at, which can land days before starts_at for
        // sports with mid-week starts (NFL Week 1 Thursday → Week 1
        // anchored to Tuesday). This is intentional — picks open with
        // lead time before the first game. The activation cron uses a
        // separate first-game-in-period signal so the league stays
        // 'open' until the first real game kicks off.
        periods.push({
          league_id: league.id,
          week_number: periodNum++,
          starts_at: current.toISOString(),
          ends_at: weekEnd.toISOString(),
        })
      }

      current.setUTCDate(current.getUTCDate() + 7)
    }
  }

  if (periods.length > 0) {
    const { error } = await supabase.from('league_weeks').insert(periods)
    if (error) {
      logger.error({ error, leagueId: league.id }, 'Failed to generate league weeks')
    }
  }

  // Sanity log — when investigating "Day 1 is on the wrong date" reports,
  // this single line shows starts_at + the first period's PT interpretation
  // side-by-side so the bug class is easy to catch in production logs.
  if (periods.length > 0) {
    const first = periods[0]
    const fmt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    logger.info({
      leagueId: league.id,
      format: league.format,
      pickFrequency: isDaily ? 'daily' : 'weekly',
      startsAtPt: fmt(league.starts_at),
      day1StartPt: fmt(first.starts_at),
      day1EndPt: fmt(first.ends_at),
      periodCount: periods.length,
    }, 'Survivor periods generated')
  }
}

async function extendLeagueWeeks(league) {
  if (!league.starts_at || !league.ends_at) return

  // Get existing weeks to find where to start appending
  const { data: existingWeeks } = await supabase
    .from('league_weeks')
    .select('*')
    .eq('league_id', league.id)
    .order('week_number', { ascending: false })
    .limit(1)

  const lastWeek = existingWeeks?.[0]
  if (!lastWeek) {
    // No existing weeks, generate from scratch
    await generateLeagueWeeks(league)
    return
  }

  const isDaily = league.settings?.pick_frequency === 'daily'
  const end = new Date(league.ends_at)
  const periods = []
  let periodNum = lastWeek.week_number + 1
  const current = new Date(lastWeek.ends_at)
  // Move past the last week's end
  current.setUTCMilliseconds(current.getUTCMilliseconds() + 1)

  if (isDaily) {
    current.setUTCHours(10, 0, 0, 0)
    while (current < end) {
      const dayEnd = new Date(current)
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
      dayEnd.setUTCHours(9, 59, 59, 999)

      periods.push({
        league_id: league.id,
        week_number: periodNum++,
        starts_at: current.toISOString(),
        ends_at: dayEnd.toISOString(),
      })

      current.setUTCDate(current.getUTCDate() + 1)
    }
  } else {
    // Align to the next anchor-day 10:00 UTC. Anchor day depends on sport
    // (matches generateLeagueWeeks): Tue for NFL/NCAAF/UFL so extensions
    // stay on the MNF-ending week; Mon for everything else.
    const isFootball = league.sport === 'americanfootball_nfl'
      || league.sport === 'americanfootball_ncaaf'
      || league.sport === 'americanfootball_ufl'
    const anchorDay = isFootball ? 2 : 1 // 0=Sun, 1=Mon, 2=Tue
    const day = current.getUTCDay()
    const daysToAnchor = ((anchorDay - day + 7) % 7) || 7
    current.setUTCDate(current.getUTCDate() + daysToAnchor)
    current.setUTCHours(10, 0, 0, 0)

    while (current < end) {
      const weekEnd = new Date(current)
      weekEnd.setUTCDate(current.getUTCDate() + 7)
      weekEnd.setUTCHours(9, 59, 59, 999)

      periods.push({
        league_id: league.id,
        week_number: periodNum++,
        starts_at: current.toISOString(),
        ends_at: weekEnd.toISOString(),
      })

      current.setUTCDate(current.getUTCDate() + 7)
    }
  }

  if (periods.length > 0) {
    const { error } = await supabase.from('league_weeks').insert(periods)
    if (error) {
      logger.error({ error, leagueId: league.id }, 'Failed to extend league weeks')
    }
  }
}

export async function joinLeague(userId, inviteCode) {
  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single()

  if (leagueError || !league) {
    const err = new Error('Invalid invite code')
    err.status = 404
    throw err
  }

  await assertLeagueJoinable(league)

  // Check max members
  if (league.max_members) {
    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', league.id)

    if (count >= league.max_members) {
      const err = new Error('This league is full')
      err.status = 400
      throw err
    }
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', userId)
    .single()

  if (existing) {
    const err = new Error('You are already a member of this league')
    err.status = 400
    throw err
  }

  const { error } = await supabase.from('league_members').insert({
    league_id: league.id,
    user_id: userId,
    role: 'member',
    lives_remaining: league.settings?.lives || 1,
  })

  if (error) {
    logger.error({ error }, 'Failed to join league')
    throw error
  }

  // Clean up any pending invitations for this user in this league. The FK
  // column on league_invitations is invited_user_id (migration 005);
  // an earlier version of this code used the non-existent column
  // `recipient_id`, which silently no-op'd and left stale invitation cards
  // visible in the navbar even after a user joined via invite code or via
  // the open-join path.
  await supabase
    .from('league_invitations')
    .delete()
    .eq('league_id', league.id)
    .eq('invited_user_id', userId)
    .eq('status', 'pending')

  return league
}

export async function getMyLeagues(userId, userTz) {
  const { data: memberships, error } = await supabase
    .from('league_members')
    .select('league_id, role, display_order, is_alive')
    .eq('user_id', userId)

  if (error) throw error
  if (!memberships?.length) return []

  const leagueIds = memberships.map((m) => m.league_id)

  const { data: leagues, error: leaguesError } = await supabase
    .from('leagues')
    .select('*')
    .in('id', leagueIds)
    .order('created_at', { ascending: false })

  if (leaguesError) throw leaguesError

  // Get member counts
  const { data: counts } = await supabase
    .from('league_members')
    .select('league_id')
    .in('league_id', leagueIds)

  const countMap = {}
  for (const c of counts || []) {
    countMap[c.league_id] = (countMap[c.league_id] || 0) + 1
  }

  const roleMap = {}
  const orderMap = {}
  const aliveMap = {}
  for (const m of memberships) {
    roleMap[m.league_id] = m.role
    orderMap[m.league_id] = m.display_order
    aliveMap[m.league_id] = m.is_alive
  }

  // Pull draft_date + draft_status for fantasy leagues so the My Leagues
  // cards can show a live "Draft starts in N days" countdown until the
  // draft completes.
  const fantasyLeagueIds = (leagues || [])
    .filter((l) => l.format === 'fantasy')
    .map((l) => l.id)
  const fantasyMeta = {}
  if (fantasyLeagueIds.length) {
    const { data: fs } = await supabase
      .from('fantasy_settings')
      .select('league_id, draft_date, draft_status')
      .in('league_id', fantasyLeagueIds)
    for (const row of fs || []) {
      fantasyMeta[row.league_id] = { draft_date: row.draft_date, draft_status: row.draft_status }
    }
  }

  // Pull alive count for survivor leagues
  const survivorLeagueIds = (leagues || [])
    .filter((l) => l.format === 'survivor' && l.status === 'active')
    .map((l) => l.id)
  const survivorAlive = {}
  if (survivorLeagueIds.length) {
    const { data: aliveRows } = await supabase
      .from('league_members')
      .select('league_id, is_alive')
      .in('league_id', survivorLeagueIds)
      .eq('is_alive', true)
    for (const row of aliveRows || []) {
      survivorAlive[row.league_id] = (survivorAlive[row.league_id] || 0) + 1
    }
  }

  // Compute my current rank in each active or completed fantasy league so
  // the card can show a "3rd" badge. Pre-draft leagues have no meaningful
  // standings; skip them. Also skip drafted-but-no-games-played leagues —
  // getFantasyStandings will happily return arbitrary rank order when every
  // team is 0-0-0 (based on tiebreaker only), but that's misleading. Runs
  // getFantasyStandings in parallel — one query group per fantasy league,
  // but typically only a few leagues per user.
  const rankedFantasyLeagues = (leagues || []).filter(
    (l) => l.format === 'fantasy' && (l.status === 'active' || l.status === 'completed')
  )
  const myFantasyRank = {}
  const fantasyTotalTeams = {}
  if (rankedFantasyLeagues.length) {
    const { getFantasyStandings } = await import('./fantasyService.js')
    const results = await Promise.all(
      rankedFantasyLeagues.map(async (l) => {
        try {
          const standings = await getFantasyStandings(l.id)
          // No games played yet → rank has no meaning (everyone tied at 0)
          const anyGamesPlayed = standings.some((s) => (s.games_played || 0) > 0)
          if (!anyGamesPlayed) return [l.id, null, standings.length]
          const me = standings.find((s) => s.user_id === userId)
          return [l.id, me?.rank ?? null, standings.length]
        } catch {
          return [l.id, null, 0]
        }
      })
    )
    for (const [id, rank, total] of results) {
      if (rank != null) myFantasyRank[id] = rank
      if (total > 0) fantasyTotalTeams[id] = total
    }
  }

  // For LOCKED bracket leagues, swap out total-joined-members for actual
  // submitted-bracket count on the card. A bracket_entries row only exists
  // after a user submits picks — joiners who never picked won't have one.
  // Pre-lock we keep showing the joined count so the card grows as people
  // join; once picks close, the "real" count is the entries that locked in.
  const bracketLeagueIds = (leagues || [])
    .filter((l) => l.format === 'bracket')
    .map((l) => l.id)
  const bracketSubmittedCount = {}
  if (bracketLeagueIds.length) {
    const { data: tournaments } = await supabase
      .from('bracket_tournaments')
      .select('id, league_id, locks_at')
      .in('league_id', bracketLeagueIds)
    const lockedTournamentIds = (tournaments || [])
      .filter((t) => t.locks_at && new Date(t.locks_at) <= new Date())
      .map((t) => t.id)
    const tournamentLeagueMap = {}
    for (const t of tournaments || []) tournamentLeagueMap[t.id] = t.league_id
    if (lockedTournamentIds.length) {
      const { data: entryRows } = await supabase
        .from('bracket_entries')
        .select('tournament_id')
        .in('tournament_id', lockedTournamentIds)
      for (const row of entryRows || []) {
        const leagueId = tournamentLeagueMap[row.tournament_id]
        if (leagueId) bracketSubmittedCount[leagueId] = (bracketSubmittedCount[leagueId] || 0) + 1
      }
    }
  }

  const result = leagues.map((league) => ({
    ...league,
    member_count: countMap[league.id] || 0,
    my_role: roleMap[league.id],
    display_order: orderMap[league.id] ?? null,
    draft_date: fantasyMeta[league.id]?.draft_date || null,
    draft_status: fantasyMeta[league.id]?.draft_status || null,
    survivor_alive: survivorAlive[league.id] ?? null,
    survivor_eliminated: league.format === 'survivor' && league.status === 'active' && aliveMap[league.id] === false ? true : undefined,
    bracket_submitted_count: bracketSubmittedCount[league.id] ?? null,
    my_fantasy_rank: myFantasyRank[league.id] ?? null,
    fantasy_total_teams: fantasyTotalTeams[league.id] ?? null,
  }))

  // Compute per-league readiness (green/yellow/red corner clip)
  try {
    const { computeLeagueReadiness } = await import('./readinessService.js')
    const readinessMap = await computeLeagueReadiness(userId, result, userTz)
    for (const l of result) {
      const r = readinessMap.get(l.id)
      l.readiness = r?.state || null
      l.readiness_detail = r?.detail || null
    }
  } catch (err) {
    logger.error({ err }, 'Failed to attach league readiness')
  }

  // Sort by display_order (nulls last), then created_at desc
  result.sort((a, b) => {
    if (a.display_order != null && b.display_order != null) return a.display_order - b.display_order
    if (a.display_order != null) return -1
    if (b.display_order != null) return 1
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return result
}

export async function getLeagueDetails(leagueId, userId) {
  // Membership lookup — non-members still get a preview view so they can
  // decide whether to accept an invitation / join an open league before
  // committing. The response carries an `is_member` flag the client uses
  // to gate write-action UI (picks, settings, thread) and surface a
  // prominent "Join League" CTA instead.
  const { data: member } = await supabase
    .from('league_members')
    .select('role, auto_connect')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  const isMember = !!member

  const { data: league, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .single()

  if (error || !league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  // Non-members get a pending-invitation lookup so the client can offer
  // "Accept Invitation" vs "Join Open League" with one call.
  let myPendingInvitation = null
  if (!isMember) {
    const { data: inv } = await supabase
      .from('league_invitations')
      .select('id, created_at, inviter:invited_by(id, username, display_name)')
      .eq('league_id', leagueId)
      .eq('invited_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    myPendingInvitation = inv || null
  }

  // Get members with user details
  const { data: members } = await supabase
    .from('league_members')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .eq('league_id', leagueId)
    .order('joined_at', { ascending: true })

  // Get pending invitations, excluding users who already joined
  const memberUserIds = new Set((members || []).map((m) => m.users?.id).filter(Boolean))
  const { data: rawPendingInvitations } = await supabase
    .from('league_invitations')
    .select('id, status, created_at, user:invited_user_id(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  const pendingInvitations = (rawPendingInvitations || []).filter((inv) => !memberUserIds.has(inv.user?.id))

  // Get current week (active period that covers now)
  const now = new Date().toISOString()
  const { data: currentWeek } = await supabase
    .from('league_weeks')
    .select('*')
    .eq('league_id', leagueId)
    .lte('starts_at', now)
    .gte('ends_at', now)
    .maybeSingle()

  // Fallback: if no active period, get the next upcoming one
  let activeWeek = currentWeek
  if (!activeWeek) {
    const { data: nextWeek } = await supabase
      .from('league_weeks')
      .select('*')
      .eq('league_id', leagueId)
      .gt('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    activeWeek = nextWeek
  }

  // Commissioner can always see settings editor (backdrop, narrative, etc.)
  // has_locked_picks tells the frontend which settings to disable
  let settingsEditable = false
  let hasLockedPicks = false
  if (member?.role === 'commissioner') {
    settingsEditable = true
    if (league.status !== 'open') {
      hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
    }
  }

  // Check if all league mates are already in user's squad
  const otherMemberIds = (members || []).map(m => m.user_id).filter(id => id !== userId)
  let allConnected = false
  if (!isMember) {
    allConnected = false // not relevant for non-members
  } else if (otherMemberIds.length > 0) {
    const { count } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`and(user_id_1.eq.${userId},user_id_2.in.(${otherMemberIds.join(',')})),and(user_id_2.eq.${userId},user_id_1.in.(${otherMemberIds.join(',')}))`)
      .eq('status', 'connected')
    allConnected = count >= otherMemberIds.length
  } else {
    allConnected = true
  }

  // Get champion data for completed leagues
  let champion = null
  if (league.status === 'completed' && league.format !== 'squares') {
    const { data: winBonus } = await supabase
      .from('bonus_points')
      .select('user_id, points, label, users(id, username, display_name, avatar_url, avatar_emoji)')
      .eq('league_id', leagueId)
      .in('type', ['league_win', 'survivor_win'])
      .order('points', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (winBonus?.users) {
      // For brackets, "competitors" = users who submitted an entry, not
      // everyone who joined the league. Prevents the champion card from
      // over-counting joiners who never filled out a bracket.
      let competitorCount = null
      if (league.format === 'bracket') {
        const { data: tourney } = await supabase
          .from('bracket_tournaments')
          .select('id')
          .eq('league_id', leagueId)
          .maybeSingle()
        if (tourney?.id) {
          const { count } = await supabase
            .from('bracket_entries')
            .select('id', { count: 'exact', head: true })
            .eq('tournament_id', tourney.id)
          competitorCount = count ?? null
        }
      }
      champion = {
        user: winBonus.users,
        points: winBonus.points,
        label: winBonus.label,
        competitor_count: competitorCount,
      }
    }
  }

  return {
    ...league,
    is_member: isMember,
    my_role: member?.role ?? null,
    my_auto_connect: member?.auto_connect ?? true,
    my_pending_invitation: myPendingInvitation,
    all_members_connected: allConnected,
    members: members || [],
    pending_invitations: isMember ? (pendingInvitations || []) : [],
    current_week: activeWeek || null,
    settings_editable: settingsEditable,
    has_locked_picks: hasLockedPicks,
    champion,
  }
}

async function checkLeagueHasLockedPicks(leagueId, league) {
  if (league.format === 'survivor') {
    const { count } = await supabase
      .from('survivor_picks')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .in('status', ['locked', 'survived', 'eliminated'])
    return count > 0
  }
  if (league.format === 'pickem') {
    const { count } = await supabase
      .from('league_picks')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .in('status', ['locked', 'settled'])
    return count > 0
  }
  return true // other formats: treat as locked
}

export async function updateLeague(leagueId, userId, data) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, status, format, settings, starts_at')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  if (league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can update league settings')
    err.status = 403
    throw err
  }

  // commissioner_note and visibility can always be updated
  const alwaysAllowed = ['commissioner_note', 'visibility', 'joins_locked_at', 'backdrop_image', 'backdrop_y']
  const noteOnly = Object.keys(data).every((k) => alwaysAllowed.includes(k))
  const settingsOnly = Object.keys(data).every((k) => ['settings', 'commissioner_note', 'starts_at', 'ends_at', 'duration', 'name', 'max_members', 'visibility', 'joins_locked_at'].includes(k))

  if (!noteOnly && league.status !== 'open') {
    // Formats whose end date is free-form (not tied to an external schedule
    // like the NFL season or a tournament bracket) — commissioners can
    // shorten or extend a running league here. Trad/salary-cap fantasy,
    // bracket, TD Pass, and survivor are deliberately omitted: their
    // windows are bound to a schedule (NFL/tournament) or to a "last one
    // standing" condition that ends the league naturally.
    const ENDS_AT_EDITABLE_FORMATS = ['hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'nba_dfs', 'mlb_dfs', 'pickem']
    const onlyEndsAtOrAlwaysAllowed = Object.keys(data).every((k) => k === 'ends_at' || alwaysAllowed.includes(k))
    const isCompleted = league.status === 'completed'
    if (onlyEndsAtOrAlwaysAllowed && !isCompleted && ENDS_AT_EDITABLE_FORMATS.includes(league.format)) {
      // Allow — fall through to update
    } else if (settingsOnly && (league.format === 'pickem' || league.format === 'survivor')) {
      // Survivor leagues end on "last one standing" — block end-date edits
      // even though the per-setting branch is otherwise permissive.
      if (league.format === 'survivor' && data.ends_at !== undefined) {
        const err = new Error("Survivor leagues end when one player is left standing — the end date can't be changed")
        err.status = 400
        throw err
      }
      const hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
      if (hasLockedPicks) {
        // Per-setting validation: block only dangerous changes
        const dangerousSettings = ['pick_frequency', 'lives']
        if (data.settings) {
          const currentSettings = league.settings || {}
          for (const key of dangerousSettings) {
            if (data.settings[key] !== undefined && data.settings[key] !== (currentSettings[key] ?? (key === 'lives' ? 1 : 'weekly'))) {
              const err = new Error(`Cannot change ${key === 'lives' ? 'lives' : 'pick frequency'} after picks have locked`)
              err.status = 400
              throw err
            }
          }
        }
        // Block starts_at changes after picks lock
        if (data.starts_at !== undefined) {
          const err = new Error('Cannot change start date after picks have locked')
          err.status = 400
          throw err
        }
      }
    } else {
      const err = new Error('Cannot update a league that has already started')
      err.status = 400
      throw err
    }
  }

  const updates = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) updates.name = data.name
  if (data.max_members !== undefined) updates.max_members = data.max_members
  if (data.settings !== undefined) updates.settings = data.settings
  if (data.starts_at !== undefined) updates.starts_at = data.starts_at
  if (data.ends_at !== undefined) {
    // Parse end date to end-of-sports-day if date-only string
    if (typeof data.ends_at === 'string' && data.ends_at.length === 10) {
      const d = new Date(data.ends_at + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      d.setUTCHours(10, 0, 0, 0)
      updates.ends_at = d.toISOString()
    } else {
      updates.ends_at = data.ends_at
    }
  }
  if (data.commissioner_note !== undefined) updates.commissioner_note = data.commissioner_note
  if (data.visibility !== undefined) updates.visibility = data.visibility
  if (data.joins_locked_at !== undefined) updates.joins_locked_at = data.joins_locked_at
  if (data.backdrop_image !== undefined) updates.backdrop_image = data.backdrop_image
  if (data.backdrop_y !== undefined) updates.backdrop_y = data.backdrop_y

  // Handle duration change — recalculate date range
  // When picks are locked, preserve existing starts_at (only extend ends_at)
  if (data.duration !== undefined) {
    updates.duration = data.duration
    const hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
    let startsAt = hasLockedPicks ? new Date(league.starts_at) : new Date()
    let endsAt = null

    if (data.duration === 'this_week') {
      const bounds = getWeekBounds(new Date(), league.sport)
      if (!hasLockedPicks) startsAt = bounds.start
      endsAt = bounds.end
    } else if (data.duration === 'full_season') {
      endsAt = regularSeasonEnd(league.sport, startsAt) || (() => {
        const d = new Date(startsAt)
        d.setMonth(d.getMonth() + 6)
        return d
      })()
    } else if (data.duration === 'playoffs_only') {
      endsAt = new Date(startsAt)
      endsAt.setMonth(endsAt.getMonth() + 3)
    }
    // custom_range: keep existing dates (user edits them separately)

    if (data.duration !== 'custom_range') {
      if (!hasLockedPicks) updates.starts_at = startsAt.toISOString()
      updates.ends_at = endsAt?.toISOString() || null
    }
  }

  const { data: updated, error } = await supabase
    .from('leagues')
    .update(updates)
    .eq('id', leagueId)
    .select()
    .single()

  if (error) throw error

  // Regenerate league weeks if dates changed
  if (updates.starts_at || updates.ends_at || data.duration) {
    const hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
    if (hasLockedPicks) {
      // Don't delete existing weeks — would cascade-delete picks
      // Instead, extend with new weeks after the last existing one
      await extendLeagueWeeks(updated)
    } else {
      await supabase.from('league_weeks').delete().eq('league_id', leagueId)
      await generateLeagueWeeks(updated)
    }
  }

  // Also regenerate if pick_frequency changed on a survivor/pickem league.
  // The dangerous-settings guard above already blocks this once picks lock,
  // so we're only in the safe pre-lock window here — clean delete + regen.
  const oldFrequency = league.settings?.pick_frequency
  const newFrequency = updates.settings?.pick_frequency
  const frequencyChanged =
    newFrequency !== undefined &&
    newFrequency !== oldFrequency &&
    (league.format === 'survivor' || league.format === 'pickem')
  if (frequencyChanged && !updates.starts_at && !updates.ends_at && !data.duration) {
    await supabase.from('league_weeks').delete().eq('league_id', leagueId)
    await generateLeagueWeeks(updated)
  }

  // If a survivor commissioner changed the lives-per-member setting before
  // picks locked, propagate to the existing league_members rows. Otherwise
  // the setting shows the new value everywhere the client renders it
  // (join card, standings header) but existing members keep their old
  // lives_remaining and see "1 life" while the league is nominally 2-life.
  // The dangerous-settings guard blocks this after picks lock, so we can
  // safely reset alive members to the new max without stepping on losses.
  const oldLives = league.settings?.lives ?? 1
  const newLives = updates.settings?.lives
  if (
    league.format === 'survivor' &&
    newLives !== undefined &&
    newLives !== oldLives
  ) {
    await supabase
      .from('league_members')
      .update({ lives_remaining: newLives })
      .eq('league_id', leagueId)
      .eq('is_alive', true)
  }

  return updated
}

export async function getLeagueMembers(leagueId, userId) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  const { data, error } = await supabase
    .from('league_members')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .eq('league_id', leagueId)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return data
}

export async function leaveLeague(leagueId, userId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (league?.commissioner_id === userId) {
    const err = new Error('The commissioner cannot leave the league')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('league_members')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function removeMember(leagueId, commissionerId, targetUserId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can remove members')
    err.status = 403
    throw err
  }

  if (commissionerId === targetUserId) {
    const err = new Error('The commissioner cannot be removed')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('league_members')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', targetUserId)

  if (error) throw error
}

export async function getLeagueWeeks(leagueId, userId) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  const { data: weeks, error } = await supabase
    .from('league_weeks')
    .select('*')
    .eq('league_id', leagueId)
    .order('week_number', { ascending: true })

  if (error) throw error
  if (!weeks?.length) return weeks

  // Hide periods that contain no scheduled games for the league's sport,
  // so leagues with overshot ends_at (e.g. a UFL pickem set to run through
  // November) don't show empty future weeks.
  const { data: league } = await supabase
    .from('leagues')
    .select('sport')
    .eq('id', leagueId)
    .single()

  const firstStart = weeks[0].starts_at
  const lastEnd = weeks[weeks.length - 1].ends_at

  let gamesQuery = supabase
    .from('games')
    .select('starts_at, sports!inner(key)')
    .gte('starts_at', firstStart)
    .lte('starts_at', lastEnd)

  if (league?.sport && league.sport !== 'all') {
    gamesQuery = gamesQuery.eq('sports.key', league.sport)
  }

  const { data: games } = await gamesQuery
  if (!games?.length) return weeks

  return weeks.filter((w) => {
    const ws = new Date(w.starts_at).getTime()
    const we = new Date(w.ends_at).getTime()
    return games.some((g) => {
      const gs = new Date(g.starts_at).getTime()
      return gs >= ws && gs <= we
    })
  })
}

export async function getPickemStandings(leagueId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .eq('league_id', leagueId)

  if (!members?.length) return []

  const userIds = members.map((m) => m.user_id)

  const useSubmissionOdds = league.settings?.lock_odds_at === 'submission'

  // Get picks for these users within the league's date range and sport
  let picksQuery = supabase
    .from('picks')
    .select('user_id, game_id, points_earned, is_correct, reward_at_submission, risk_at_submission, games!inner(starts_at, sports!inner(key))')
    .in('user_id', userIds)
    .eq('status', 'settled')

  if (league.sport !== 'all') {
    picksQuery = picksQuery.eq('games.sports.key', league.sport)
  }
  if (league.starts_at) {
    picksQuery = picksQuery.gte('games.starts_at', league.starts_at)
  }
  if (league.ends_at) {
    picksQuery = picksQuery.lte('games.starts_at', league.ends_at)
  }

  const { data: picks } = await picksQuery

  // Also fetch settled prop picks for these users
  let propPicksQuery = supabase
    .from('prop_picks')
    .select('user_id, points_earned, is_correct, reward_at_submission, risk_at_submission, player_props!inner(game_id, sport_id, games!inner(starts_at, sports!inner(key)))')
    .in('user_id', userIds)
    .eq('status', 'settled')

  if (league.sport !== 'all') {
    propPicksQuery = propPicksQuery.eq('player_props.games.sports.key', league.sport)
  }
  if (league.starts_at) {
    propPicksQuery = propPicksQuery.gte('player_props.games.starts_at', league.starts_at)
  }
  if (league.ends_at) {
    propPicksQuery = propPicksQuery.lte('player_props.games.starts_at', league.ends_at)
  }

  const { data: propPicks } = await propPicksQuery

  // If games_per_week is set, filter to only selected games
  let validGameIds = null
  if (league.settings?.games_per_week) {
    const { data: selections } = await supabase
      .from('pickem_selections')
      .select('user_id, game_id')
      .eq('league_id', leagueId)

    if (selections) {
      validGameIds = {}
      for (const s of selections) {
        if (!validGameIds[s.user_id]) validGameIds[s.user_id] = new Set()
        validGameIds[s.user_id].add(s.game_id)
      }
    }
  }

  // Aggregate by user
  const statsMap = {}
  for (const m of members) {
    statsMap[m.user_id] = {
      user_id: m.user_id,
      user: m.users,
      total_points: 0,
      total_picks: 0,
      correct_picks: 0,
    }
  }

  for (const pick of picks || []) {
    // Skip if games_per_week is set and this game wasn't selected
    if (validGameIds && !validGameIds[pick.user_id]?.has(pick.game_id)) continue

    const s = statsMap[pick.user_id]
    if (!s) continue

    let points = pick.points_earned || 0
    if (useSubmissionOdds && pick.reward_at_submission != null) {
      if (pick.is_correct === true) points = pick.reward_at_submission
      else if (pick.is_correct === false) points = -(pick.risk_at_submission || 0)
      else points = 0
    }

    s.total_points += points
    s.total_picks++
    if (pick.is_correct) s.correct_picks++
  }

  // Add prop pick points to standings
  for (const propPick of propPicks || []) {
    const s = statsMap[propPick.user_id]
    if (!s) continue

    let points = propPick.points_earned || 0
    if (useSubmissionOdds && propPick.reward_at_submission != null) {
      if (propPick.is_correct === true) points = propPick.reward_at_submission
      else if (propPick.is_correct === false) points = -(propPick.risk_at_submission || 0)
      else points = 0
    }

    s.total_points += points
    s.total_picks++
    if (propPick.is_correct) s.correct_picks++
  }

  const standings = Object.values(statsMap)
    .sort((a, b) => b.total_points - a.total_points)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  return standings
}

export async function selectPickemGames(leagueId, userId, weekId, gameIds) {
  const { data: league } = await supabase
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  const limit = league.settings?.games_per_week
  if (!limit) {
    const err = new Error('This league does not have a games-per-week limit')
    err.status = 400
    throw err
  }

  if (gameIds.length > limit) {
    const err = new Error(`You can only select ${limit} games per week`)
    err.status = 400
    throw err
  }

  // Clear existing selections for this week
  await supabase
    .from('pickem_selections')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('league_week_id', weekId)

  // Insert new selections
  const rows = gameIds.map((gameId) => ({
    league_id: leagueId,
    user_id: userId,
    league_week_id: weekId,
    game_id: gameId,
  }))

  const { error } = await supabase.from('pickem_selections').insert(rows)
  if (error) throw error

  return rows
}

export async function deleteLeague(leagueId, userId) {
  const { data: league, error: fetchError } = await supabase
    .from('leagues')
    .select('id, name, commissioner_id, format')
    .eq('id', leagueId)
    .single()

  if (fetchError || !league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  if (league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can delete a league')
    err.status = 403
    throw err
  }

  // Get members to notify (exclude commissioner)
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .neq('user_id', userId)

  const { error } = await supabase
    .from('leagues')
    .delete()
    .eq('id', leagueId)

  if (error) {
    logger.error({ error, leagueId }, 'Failed to delete league')
    throw error
  }

  // Notify members after deletion
  if (members?.length) {
    const { createNotification } = await import('./notificationService.js')
    for (const m of members) {
      await createNotification(m.user_id, 'league_deleted',
        `The league "${league.name}" has been deleted by the commissioner.`)
    }
  }
}

export async function getLeagueStandings(leagueId, userId) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  const { data: league } = await supabase
    .from('leagues')
    .select('format')
    .eq('id', leagueId)
    .single()

  if (league.format === 'pickem') {
    return getLeaguePickStandings(leagueId)
  }

  if (league.format === 'bracket') {
    return getBracketStandings(leagueId)
  }

  // For survivor and squares, return members with relevant data
  if (league.format === 'survivor') {
    const { data: members } = await supabase
      .from('league_members')
      .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
      .eq('league_id', leagueId)
      .order('is_alive', { ascending: false })

    return members || []
  }

  return []
}
