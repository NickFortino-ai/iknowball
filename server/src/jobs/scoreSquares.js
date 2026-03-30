import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'

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
    }
  }
}

/**
 * Auto-score quarters for squares boards from live/final game data.
 */
async function autoScoreQuarters() {
  const { data: boards } = await supabase
    .from('squares_boards')
    .select('id, league_id, row_digits, col_digits, digits_locked, q1_away_score, q2_away_score, q3_away_score, q4_away_score, game_id, games!inner(status, home_team, away_team, external_id), leagues!inner(status, settings)')
    .eq('digits_locked', true)
    .in('games.status', ['live', 'final'])
    .neq('leagues.status', 'completed')

  if (!boards?.length) return

  for (const board of boards) {
    const game = board.games
    if (!game?.external_id) continue

    // Fetch live scores from ESPN or our games table
    const { data: gameData } = await supabase
      .from('games')
      .select('home_score, away_score, status, live_home_score, live_away_score')
      .eq('id', board.game_id)
      .single()

    if (!gameData) continue

    const homeScore = gameData.live_home_score ?? gameData.home_score
    const awayScore = gameData.live_away_score ?? gameData.away_score
    if (homeScore == null || awayScore == null) continue

    // For now, we can only reliably score the final result
    // Quarter-by-quarter scoring requires ESPN box score data
    // Score Q4 (final) when game is final and not yet scored
    if (gameData.status === 'final' && board.q4_away_score == null) {
      await scoreQuarterForBoard(board, 4, awayScore, homeScore)
      logger.info({ boardId: board.id, leagueId: board.league_id, score: `${awayScore}-${homeScore}` }, 'Auto-scored squares final')

      // Auto-complete the league
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
