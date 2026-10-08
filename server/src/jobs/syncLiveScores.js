import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchESPNScoreboard, matchESPNToGame } from '../services/espnService.js'
import { scoreCompletedGame, scoreParlayLegs } from '../services/scoringService.js'
import { scoreSurvivorPicks } from '../services/survivorService.js'
import { scoreLeaguePicks } from '../services/leaguePickService.js'
import { scoreBracketMatchups } from '../services/bracketService.js'
import { findESPNEventId, fetchGameTopScorers } from '../services/espnService.js'

const SPORTS = [
  'americanfootball_nfl',
  'americanfootball_nfl_preseason',
  'americanfootball_ncaaf',
  'americanfootball_ufl',
  'basketball_nba',
  'basketball_ncaab',
  'basketball_wncaab',
  'basketball_wnba',
  'baseball_mlb',
  'icehockey_nhl',
  'soccer_usa_mls',
  'soccer_world_cup',
]

// Categories a COMPLETE top-scorer capture has, per team, for sports whose
// extractor emits more than one. Used to tell a partial capture from a
// finished one — see retryStaleTopScorers. Only MLB splits its leaders by
// category today (extractMlbTopPerformers emits a hitter and a pitcher);
// everything else writes a single 'overall' row per team, where "any rows at
// all" is already the right test.
const EXPECTED_SCORER_CATEGORIES = {
  baseball_mlb: ['hitter', 'pitcher'],
}

// How far back retryStaleTopScorers will look, and how many games it will
// repair in any single pass. See that function for why the window is wide.
const RETRY_WINDOW_HOURS = 72
const MAX_RETRIES_PER_PASS = 5

async function syncSportLiveScores(sportKey) {
  // Smart gate: only fetch if there are live or recently-started games
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sportKey)
    .single()

  if (!sport) return 0

  const now = new Date()
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)

  const { count: liveCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)
    .eq('status', 'live')

  const { count: recentCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)
    .eq('status', 'upcoming')
    .gte('starts_at', sixHoursAgo.toISOString())
    .lte('starts_at', now.toISOString())

  // Recently-postponed games are a resume candidate too — a rain delay
  // can be reported as postponed by ESPN and then flip back to in-progress
  // once play resumes. Without this the row stays stuck at whatever score
  // it had when the delay hit. Same 6h window as recent 'upcoming'.
  const { count: postponedCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)
    .eq('status', 'postponed')
    .gte('starts_at', sixHoursAgo.toISOString())
    .lte('starts_at', now.toISOString())

  if (liveCount === 0 && recentCount === 0 && postponedCount === 0) {
    logger.debug({ sportKey }, 'No live or recently started games, skipping ESPN fetch')
    return 0
  }

  // Fetch games that could need live score updates. Include 'postponed' so
  // rain-delayed games get re-checked and flip back to 'live' once ESPN
  // reports state='in' again.
  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('sport_id', sport.id)
    .in('status', ['upcoming', 'live', 'postponed'])
    .gte('starts_at', sixHoursAgo.toISOString())
    .lte('starts_at', new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString())

  if (!games?.length) return 0

  // Group games by their ET-date so we can fetch the correct ESPN
  // scoreboard for each. Without this, a game that started 10pm ET the
  // day before is on yesterday's scoreboard while ESPN's default endpoint
  // returns today-ET's slate — hides late-night live PT games entirely.
  const etDateOf = (iso) => {
    // YYYYMMDD in ET as ESPN expects for the ?dates= param
    const d = new Date(iso)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d)
    const y = parts.find((p) => p.type === 'year').value
    const m = parts.find((p) => p.type === 'month').value
    const day = parts.find((p) => p.type === 'day').value
    return `${y}${m}${day}`
  }
  const uniqueDates = [...new Set(games.map((g) => etDateOf(g.starts_at)))]
  const eventsByDate = {}
  for (const d of uniqueDates) {
    eventsByDate[d] = await fetchESPNScoreboard(sportKey, d)
  }
  // Also merge the default (no-date) scoreboard so we still catch cases
  // ESPN groups slightly differently. Duplicates dedupe naturally via the
  // matchESPNToGame path since we only take .find() on the first match.
  const defaultEvents = await fetchESPNScoreboard(sportKey)
  const allEvents = [...defaultEvents, ...Object.values(eventsByDate).flat()]
  if (!allEvents.length) return 0

  let updated = 0
  const unmatched = []
  // TODO(remove after 2026-07-24): temporary debug for MLS name mismatch
  if (sportKey === 'soccer_usa_mls') {
    logger.info({
      dbGames: games.map((g) => ({ id: g.id, home: g.home_team, away: g.away_team, status: g.status, etDate: etDateOf(g.starts_at) })),
      espnEventsCount: allEvents.length,
      espnDates: uniqueDates,
      espnEvents: allEvents.slice(0, 30).map((e) => ({ home: e.homeTeam, away: e.awayTeam, state: e.state, homeScore: e.homeScore, awayScore: e.awayScore })),
    }, 'MLS sync debug')
  }
  for (const game of games) {
    const match = allEvents.find((e) => matchESPNToGame(e, game))
    if (!match) {
      // Only flag games already marked live — upcoming games won't be on ESPN yet
      if (game.status === 'live') {
        unmatched.push({ id: game.id, home: game.home_team, away: game.away_team })
      }
      continue
    }

    if (match.state === 'in') {
      // Guard: don't mark a game live if it hasn't reached its start time yet
      if (new Date(game.starts_at) > new Date()) {
        logger.warn({ gameId: game.id, startsAt: game.starts_at }, 'ESPN reports in-progress but game has not reached start time, skipping')
        continue
      }
      // Skip the write when nothing actually changed. This ran every 60s
      // for every in-progress game and always stamped updated_at, so each
      // tick produced a WAL record even when the score, period and clock
      // were identical. `games` is in the Realtime publication, so every
      // one of those rows was then RLS-evaluated and fanned out to every
      // connected client -- realtime.apply_rls is the single most expensive
      // thing in this database by a factor of four (24.5M calls, ~36 hours
      // of database time). A baseball game between innings, or any game the
      // poll catches twice in the same state, no longer costs anything.
      const unchanged = game.status === 'live'
        && game.live_home_score === match.homeScore
        && game.live_away_score === match.awayScore
        && game.period === match.period
        && game.clock === match.clock
      if (unchanged) continue

      const { error } = await supabase
        .from('games')
        .update({
          status: 'live',
          live_home_score: match.homeScore,
          live_away_score: match.awayScore,
          period: match.period,
          clock: match.clock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)

      if (error) {
        logger.error({ error, gameId: game.id }, 'Failed to update live score')
        continue
      }
      updated++
    } else if (match.state === 'postponed' && game.status !== 'postponed' && game.status !== 'final') {
      // ESPN says game is postponed/canceled — mark it so picks aren't settled
      const wasPreStart = game.status === 'upcoming'
      const { error } = await supabase
        .from('games')
        .update({ status: 'postponed', updated_at: new Date().toISOString() })
        .eq('id', game.id)
      if (error) {
        logger.error({ error, gameId: game.id }, 'Failed to mark game postponed')
        continue
      }
      logger.info({ gameId: game.id, home: game.home_team, away: game.away_team, wasPreStart }, 'Marked game postponed via ESPN')
      // For MLB pre-start postponements only, flag the DFS salary rows so
      // MLB DFS / HR Derby / Strikeouts users can swap out players whose
      // game never actually happened. Mid-game postponements (previously
      // 'live') stay locked — users who banked partial innings eat it.
      if (wasPreStart && sportKey === 'baseball_mlb') {
        try {
          const gameDate = new Date(game.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
          const { error: flagErr, count } = await supabase
            .from('mlb_dfs_salaries')
            .update({ is_postponed: true }, { count: 'exact' })
            .eq('game_date', gameDate)
            .in('team', [game.home_team, game.away_team])
          if (flagErr) {
            logger.error({ err: flagErr, gameId: game.id }, 'Failed to flag mlb_dfs_salaries as postponed')
          } else {
            logger.info({ gameId: game.id, gameDate, flagged: count }, 'Flagged mlb_dfs_salaries as postponed (pre-start)')
          }
        } catch (err) {
          logger.error({ err, gameId: game.id }, 'Exception flagging postponed salaries')
        }
      }
      updated++
      continue
    } else if (match.state === 'post' && game.status === 'live') {
      // ESPN says game is final but our DB still has it as live — finalize it
      let winner = null
      if (match.homeScore > match.awayScore) winner = 'home'
      else if (match.awayScore > match.homeScore) winner = 'away'
      // Soccer knockout penalty-shootout tiebreaker: if regulation score
      // is tied but ESPN flags one competitor as winner (PK shootout
      // result), use that. Without this, World Cup R16-onward bracket
      // picks would never auto-settle on shootout matches.
      else if (match.homeWinner && !match.awayWinner) winner = 'home'
      else if (match.awayWinner && !match.homeWinner) winner = 'away'

      // World Cup knockout tied-score guard: if regulation ended tied
      // and ESPN hasn't yet flagged the shootout winner, DO NOT
      // finalize. ESPN often takes 5-30 min (sometimes longer) to set
      // competitor.winner=true after a PK shootout. Finalizing with
      // winner=null strands the game in status='final' and skips this
      // branch on every subsequent tick — the shootout result never
      // gets picked up. Mirrors the same guard in scoreGames.js:116.
      if (sportKey === 'soccer_world_cup' && winner === null) {
        logger.warn({ gameId: game.id, home: game.home_team, away: game.away_team, homeScore: match.homeScore, awayScore: match.awayScore }, 'World Cup knockout reported tied via ESPN with no winner flag — leaving as live, will retry next tick')
        continue
      }

      // Only update if still live (prevents race with scoreGames)
      const { data: finalized, error } = await supabase
        .from('games')
        .update({
          status: 'final',
          home_score: match.homeScore,
          away_score: match.awayScore,
          winner,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)
        .eq('status', 'live')
        .select()
        .single()

      if (error || !finalized) {
        if (error) logger.error({ error, gameId: game.id }, 'Failed to finalize game via ESPN')
        continue
      }

      logger.info({ gameId: game.id, home: game.home_team, away: game.away_team, winner }, 'Finalized game via ESPN live sync')

      // Run full scoring pipeline
      try {
        await scoreCompletedGame(game.id, winner, game.sport_id)
        await scoreParlayLegs(game.id, winner)
        await scoreSurvivorPicks(game.id, winner)
        await scoreLeaguePicks(game.id, winner)

        if (winner) {
          try {
            await scoreBracketMatchups(game.home_team, game.away_team, winner, match.homeScore, match.awayScore, sportKey)
          } catch (err) {
            logger.error({ err, gameId: game.id }, 'Failed to auto-settle bracket matchups via ESPN')
          }
        }
      } catch (err) {
        logger.error({ err, gameId: game.id }, 'Scoring failed for ESPN-finalized game, reverting to live')
        await supabase
          .from('games')
          .update({ status: 'live', updated_at: new Date().toISOString() })
          .eq('id', game.id)
        continue
      }

      // Fetch top scorers (fire-and-forget)
      ;(async () => {
        try {
          const espnEventId = await findESPNEventId(sportKey, game.home_team, game.away_team, game.starts_at)
          if (!espnEventId) return
          const scorers = await fetchGameTopScorers(sportKey, espnEventId)
          if (!scorers.length) return
          for (const s of scorers) {
            await supabase
              .from('game_top_scorers')
              .upsert({
                game_id: game.id,
                team: s.team,
                player_name: s.playerName,
                points: s.points,
                headshot_url: s.headshotUrl,
                category: s.category || 'overall',
                stat_line: s.statLine || null,
              }, { onConflict: 'game_id,team,category' })
          }
          logger.info({ gameId: game.id, count: scorers.length }, 'Stored top scorers from ESPN')
        } catch (err) {
          logger.warn({ err: err.message, gameId: game.id }, 'Failed to fetch top scorers')
        }
      })()

      updated++
    }
  }

  if (unmatched.length) {
    // allEvents, not espnEvents — the latter is only a FIELD NAME in the
    // debug log above, never a variable. This threw ReferenceError and killed
    // the whole sync for that sport, but only when something was unmatched,
    // which is why it surfaced intermittently rather than immediately.
    const espnTeams = allEvents.map((e) => `${e.awayTeam} @ ${e.homeTeam}`)
    logger.info({ sportKey, unmatched, espnTeams }, 'Unmatched games — no ESPN match found')
  }

  return updated
}

// Retry top scorer fetch for games that finalized within the last few
// hours but have no top_scorer rows OR only all-zero rows (which means
// the original fire-and-forget call hit ESPN before its box score had
// populated stats).
async function retryStaleTopScorers() {
  // 72h, not 6. Six hours gives a partial capture one short shot at being
  // repaired, and if anything goes wrong in that span — an ESPN hiccup, a
  // deploy, a slow pass — the game ages out and stays broken forever. Seven
  // MLB playoff games were sitting half-captured when this was widened,
  // every one of them a game whose window had closed.
  //
  // The extra reach costs nothing in the common case: a complete game exits
  // on the needsRefresh check below without touching ESPN. Only genuinely
  // incomplete games cost a lookup, and MAX_RETRIES_PER_PASS bounds how many
  // of those run in any one minute.
  const cutoff = new Date(Date.now() - RETRY_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data: finalGames } = await supabase
    .from('games')
    .select('id, home_team, away_team, starts_at, sports!inner(key)')
    .eq('status', 'final')
    .gte('starts_at', cutoff)
    .order('starts_at', { ascending: false })

  if (!finalGames?.length) return 0

  let refreshed = 0
  for (const game of finalGames) {
    // Newest first, so a backlog drains from the games people are looking at
    // now. Capped per pass because each retry is a pair of ESPN calls and
    // this runs every minute — we have been per-host blocked by ESPN once
    // already.
    if (refreshed >= MAX_RETRIES_PER_PASS) break
    const sportKey = game.sports?.key
    if (!SPORTS.includes(sportKey)) continue

    const { data: scorerRows } = await supabase
      .from('game_top_scorers')
      .select('points, team, category')
      .eq('game_id', game.id)

    // A PARTIAL capture counts as stale too. This asked "do we have any
    // rows", not "do we have the complete set", so a box score read after
    // the batting lines populated but before the pitching ones stored two
    // hitters, looked answered, and was never retried. The 2026-10-04
    // Dodgers/Braves game sat like that: both hitters, neither pitcher,
    // while ESPN had full pitching for all 13 pitchers who appeared.
    const expected = EXPECTED_SCORER_CATEGORIES[sportKey]
    let incomplete = false
    if (expected && scorerRows?.length) {
      const categoriesByTeam = new Map()
      for (const r of scorerRows) {
        if (!categoriesByTeam.has(r.team)) categoriesByTeam.set(r.team, new Set())
        categoriesByTeam.get(r.team).add(r.category)
      }
      incomplete = categoriesByTeam.size < 2
        || [...categoriesByTeam.values()].some((cats) => expected.some((c) => !cats.has(c)))
    }

    const needsRefresh = !scorerRows?.length || scorerRows.every((r) => (r.points || 0) === 0) || incomplete
    if (!needsRefresh) continue

    try {
      const espnEventId = await findESPNEventId(sportKey, game.home_team, game.away_team, game.starts_at)
      if (!espnEventId) continue
      const scorers = await fetchGameTopScorers(sportKey, espnEventId)
      if (!scorers.length) continue
      for (const s of scorers) {
        await supabase
          .from('game_top_scorers')
          .upsert({
            game_id: game.id,
            team: s.team,
            player_name: s.playerName,
            points: s.points,
            headshot_url: s.headshotUrl,
            category: s.category || 'overall',
            stat_line: s.statLine || null,
          }, { onConflict: 'game_id,team,category' })
      }
      refreshed++
      logger.info({ gameId: game.id, count: scorers.length }, 'Refreshed stale top scorers')
    } catch (err) {
      logger.warn({ err: err.message, gameId: game.id }, 'Failed to refresh top scorers')
    }
  }
  return refreshed
}

export async function syncLiveScores() {
  logger.info('Starting live scores sync...')

  let total = 0
  for (const sportKey of SPORTS) {
    try {
      const count = await syncSportLiveScores(sportKey)
      total += count
    } catch (err) {
      logger.error({ err, sportKey }, 'Live scores sync failed for sport')
    }
  }

  try {
    const refreshed = await retryStaleTopScorers()
    if (refreshed) logger.info({ refreshed }, 'Top scorer retry pass complete')
  } catch (err) {
    logger.error({ err }, 'Top scorer retry pass failed')
  }

  logger.info({ total }, 'Live scores sync complete')
}
