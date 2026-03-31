import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const ESPN_PATHS = {
  basketball_nba: 'basketball/nba',
  basketball_ncaab: 'basketball/mens-college-basketball',
  basketball_wnba: 'basketball/wnba',
  americanfootball_nfl: 'football/nfl',
  americanfootball_ncaaf: 'football/college-football',
  baseball_mlb: 'baseball/mlb',
  icehockey_nhl: 'hockey/nhl',
  soccer_usa_mls: 'soccer/usa.1',
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Auto-lock digits for squares boards whose game is about to start.
 * Locks 5 minutes before game time.
 */
async function autoLockDigits() {
  const now = new Date()
  const lockWindow = new Date(now.getTime() + 5 * 60 * 1000) // 5 min from now

  const { data: boards } = await supabase
    .from('squares_boards')
    .select('id, league_id, game_id, digits_locked, games!inner(starts_at)')
    .eq('digits_locked', false)
    .lte('games.starts_at', lockWindow.toISOString())

  if (!boards?.length) return

  for (const board of boards) {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const rowDigits = shuffle(digits)
    const colDigits = shuffle(digits)

    const { error } = await supabase
      .from('squares_boards')
      .update({
        row_digits: rowDigits,
        col_digits: colDigits,
        digits_locked: true,
        updated_at: now.toISOString(),
      })
      .eq('id', board.id)
      .eq('digits_locked', false) // guard against race

    if (error) {
      logger.error({ error, boardId: board.id }, 'Failed to auto-lock squares digits')
    } else {
      logger.info({ boardId: board.id, leagueId: board.league_id }, 'Auto-locked squares digits')

      // Activate the league if still open
      await supabase
        .from('leagues')
        .update({ status: 'active', updated_at: now.toISOString() })
        .eq('id', board.league_id)
        .eq('status', 'open')
    }
  }
}

/**
 * Match a game to an ESPN event by team names on the scoreboard.
 */
function matchTeam(a, b) {
  const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const an = normalize(a), bn = normalize(b)
  if (an === bn || an.includes(bn) || bn.includes(an)) return true
  const al = an.split(/\s+/).pop(), bl = bn.split(/\s+/).pop()
  return al.length > 2 && al === bl
}

/**
 * Auto-score quarters for squares boards from ESPN live/final game data.
 * Finds the ESPN event by matching teams on the scoreboard, then fetches
 * the summary endpoint for per-quarter linescores.
 */
async function autoScoreQuarters() {
  // Get all locked boards that aren't fully scored yet
  const { data: boards } = await supabase
    .from('squares_boards')
    .select('id, league_id, row_digits, col_digits, digits_locked, q1_away_score, q2_away_score, q3_away_score, q4_away_score, game_id, games(status, home_team, away_team, starts_at, sports(key)), leagues(status, settings)')
    .eq('digits_locked', true)
    .is('q4_away_score', null) // not yet fully scored

  if (!boards?.length) {
    logger.debug('No squares boards to score')
    return
  }

  logger.info({ count: boards.length }, 'Found squares boards to score')

  for (const board of boards) {
    if (board.leagues?.status === 'completed') continue

    const game = board.games
    if (!game) { logger.warn({ boardId: board.id }, 'Squares board has no game data'); continue }

    const sportKey = game.sports?.key
    const espnPath = ESPN_PATHS[sportKey]
    if (!espnPath) { logger.warn({ boardId: board.id, sportKey }, 'No ESPN path for sport'); continue }

    // Find ESPN event ID by matching teams on the scoreboard
    let espnEventId = null
    let homeLinescores, awayLinescores, isFinal
    try {
      const gameDate = new Date(game.starts_at)
      const dateStr = `${gameDate.getFullYear()}${String(gameDate.getMonth() + 1).padStart(2, '0')}${String(gameDate.getDate()).padStart(2, '0')}`
      const sbRes = await fetch(`${ESPN_BASE}/${espnPath}/scoreboard?dates=${dateStr}`)
      if (!sbRes.ok) continue
      const sbData = await sbRes.json()

      const espnEvent = (sbData.events || []).find((ev) => {
        const comp = ev.competitions?.[0]
        if (!comp) return false
        const home = comp.competitors?.find((c) => c.homeAway === 'home')
        const away = comp.competitors?.find((c) => c.homeAway === 'away')
        return home && away && matchTeam(home.team?.displayName || '', game.home_team) && matchTeam(away.team?.displayName || '', game.away_team)
      })

      if (!espnEvent) {
        logger.debug({ boardId: board.id, home: game.home_team, away: game.away_team }, 'No ESPN event match for squares game')
        continue
      }
      espnEventId = espnEvent.id

      // Fetch summary for linescores
      const res = await fetch(`${ESPN_BASE}/${espnPath}/summary?event=${espnEventId}`)
      if (!res.ok) continue
      const summary = await res.json()

      const comp = summary.header?.competitions?.[0]
      if (!comp) continue

      const homeComp = comp.competitors?.find((c) => c.homeAway === 'home')
      const awayComp = comp.competitors?.find((c) => c.homeAway === 'away')
      if (!homeComp || !awayComp) continue

      homeLinescores = homeComp.linescores || []
      awayLinescores = awayComp.linescores || []
      isFinal = comp.status?.type?.name === 'STATUS_FINAL'
    } catch (err) {
      logger.warn({ err: err.message, boardId: board.id }, 'Failed to fetch ESPN data for squares')
      continue
    }

    // Score each completed quarter that hasn't been scored yet
    const boardQuarters = [board.q1_away_score, board.q2_away_score, board.q3_away_score, board.q4_away_score]

    for (let q = 0; q < 4; q++) {
      if (boardQuarters[q] != null) continue // already scored
      if (!homeLinescores[q] || !awayLinescores[q]) break // quarter not played yet

      // Cumulative scores through this quarter
      let homeCum = 0, awayCum = 0
      for (let i = 0; i <= q; i++) {
        homeCum += parseInt(homeLinescores[i]?.value ?? homeLinescores[i]?.displayValue ?? '0', 10)
        awayCum += parseInt(awayLinescores[i]?.value ?? awayLinescores[i]?.displayValue ?? '0', 10)
      }

      await scoreQuarterForBoard(board, q + 1, awayCum, homeCum)
      logger.info({ boardId: board.id, quarter: q + 1, score: `${awayCum}-${homeCum}` }, 'Auto-scored squares quarter')
    }

    // Auto-complete when game is final and all quarters scored
    if (isFinal && board.q4_away_score == null && homeLinescores.length >= 4) {
      // Q4 was just scored above, check the updated board
      const { data: updated } = await supabase
        .from('squares_boards')
        .select('q1_away_score, q2_away_score, q3_away_score, q4_away_score')
        .eq('id', board.id)
        .single()

      if (updated && [updated.q1_away_score, updated.q2_away_score, updated.q3_away_score, updated.q4_away_score].every((s) => s != null)) {
        const { error: completeErr } = await supabase
          .from('leagues')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', board.league_id)
          .eq('status', 'active')

        if (!completeErr) {
          logger.info({ leagueId: board.league_id }, 'Auto-completed squares league')
        }
      }
    }
  }
}

async function scoreQuarterForBoard(board, quarter, awayScore, homeScore) {
  const awayDigit = awayScore % 10
  const homeDigit = homeScore % 10

  const rowPos = board.row_digits.indexOf(awayDigit)
  const colPos = board.col_digits.indexOf(homeDigit)

  // Find the claim at that position
  const { data: winningClaim } = await supabase
    .from('squares_claims')
    .select('user_id, users(username)')
    .eq('board_id', board.id)
    .eq('row_pos', rowPos)
    .eq('col_pos', colPos)
    .maybeSingle()

  const updates = { updated_at: new Date().toISOString() }
  updates[`q${quarter}_away_score`] = awayScore
  updates[`q${quarter}_home_score`] = homeScore
  if (winningClaim) updates[`q${quarter}_winner_id`] = winningClaim.user_id

  const { error } = await supabase
    .from('squares_boards')
    .update(updates)
    .eq('id', board.id)

  if (error) {
    logger.error({ error, boardId: board.id, quarter }, 'Failed to auto-score squares quarter')
    return
  }

  // Award points and notify winner
  if (winningClaim) {
    const pointsPerQuarter = board.leagues?.settings?.points_per_quarter || [10, 10, 10, 10]
    const points = pointsPerQuarter[quarter - 1] || 10

    await supabase.from('bonus_points').insert({
      user_id: winningClaim.user_id,
      league_id: board.league_id,
      type: 'squares_quarter_win',
      points,
      metadata: { quarter, awayScore, homeScore },
    })

    await createNotification(
      winningClaim.user_id,
      'squares_quarter_win',
      `You won Q${quarter} in squares! (${awayScore}-${homeScore})`,
      { leagueId: board.league_id, quarter, points }
    )
  }
}

/**
 * Main job: auto-lock digits before game start, auto-score from live data.
 */
export async function scoreSquares() {
  try {
    await autoLockDigits()
  } catch (err) {
    logger.error({ err }, 'Auto-lock squares digits failed')
  }

  try {
    await autoScoreQuarters()
  } catch (err) {
    logger.error({ err }, 'Auto-score squares quarters failed')
  }
}
