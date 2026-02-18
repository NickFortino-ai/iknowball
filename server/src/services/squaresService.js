import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

export async function getBoard(leagueId) {
  const { data: board, error } = await supabase
    .from('squares_boards')
    .select('*, games(id, home_team, away_team, starts_at, status, home_score, away_score)')
    .eq('league_id', leagueId)
    .single()

  if (error || !board) {
    const err = new Error('Squares board not found')
    err.status = 404
    throw err
  }

  const { data: claims } = await supabase
    .from('squares_claims')
    .select('*, users(id, username, display_name, avatar_emoji)')
    .eq('board_id', board.id)

  return { ...board, claims: claims || [] }
}

export async function claimSquare(leagueId, userId, rowPos, colPos) {
  const { data: board } = await supabase
    .from('squares_boards')
    .select('id, digits_locked, league_id, leagues(settings)')
    .eq('league_id', leagueId)
    .single()

  if (!board) {
    const err = new Error('Squares board not found')
    err.status = 404
    throw err
  }

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

  const settings = board.leagues?.settings || {}
  if (settings.assignment_method === 'random') {
    const err = new Error('Squares are randomly assigned in this league')
    err.status = 400
    throw err
  }

  // Check if already claimed
  const { data: existing } = await supabase
    .from('squares_claims')
    .select('id')
    .eq('board_id', board.id)
    .eq('row_pos', rowPos)
    .eq('col_pos', colPos)
    .single()

  if (existing) {
    const err = new Error('This square is already claimed')
    err.status = 400
    throw err
  }

  // Check squares per member limit
  if (settings.squares_per_member) {
    const { count } = await supabase
      .from('squares_claims')
      .select('id', { count: 'exact', head: true })
      .eq('board_id', board.id)
      .eq('user_id', userId)

    if (count >= settings.squares_per_member) {
      const err = new Error(`You can only claim ${settings.squares_per_member} squares`)
      err.status = 400
      throw err
    }
  }

  const { data, error } = await supabase
    .from('squares_claims')
    .insert({
      board_id: board.id,
      user_id: userId,
      row_pos: rowPos,
      col_pos: colPos,
    })
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to claim square')
    throw error
  }

  return data
}

export async function randomAssignSquares(leagueId, userId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, settings')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can assign squares')
    err.status = 403
    throw err
  }

  const { data: board } = await supabase
    .from('squares_boards')
    .select('id')
    .eq('league_id', leagueId)
    .single()

  if (!board) {
    const err = new Error('Squares board not found')
    err.status = 404
    throw err
  }

  // Clear existing claims
  await supabase.from('squares_claims').delete().eq('board_id', board.id)

  // Get members
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)

  if (!members?.length) {
    const err = new Error('No members to assign squares to')
    err.status = 400
    throw err
  }

  // Generate all 100 squares
  const allSquares = []
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      allSquares.push({ row_pos: r, col_pos: c })
    }
  }

  // Shuffle squares
  for (let i = allSquares.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[allSquares[i], allSquares[j]] = [allSquares[j], allSquares[i]]
  }

  // Distribute evenly
  const claims = allSquares.map((sq, i) => ({
    board_id: board.id,
    user_id: members[i % members.length].user_id,
    row_pos: sq.row_pos,
    col_pos: sq.col_pos,
  }))

  const { error } = await supabase.from('squares_claims').insert(claims)
  if (error) {
    logger.error({ error }, 'Failed to randomly assign squares')
    throw error
  }

  return claims.length
}

export async function lockDigits(leagueId, userId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can lock digits')
    err.status = 403
    throw err
  }

  // Generate random permutations of 0-9
  const shuffle = (arr) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const rowDigits = shuffle(digits)
  const colDigits = shuffle(digits)

  const { data, error } = await supabase
    .from('squares_boards')
    .update({
      row_digits: rowDigits,
      col_digits: colDigits,
      digits_locked: true,
      updated_at: new Date().toISOString(),
    })
    .eq('league_id', leagueId)
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to lock digits')
    throw error
  }

  return data
}

export async function scoreQuarter(leagueId, userId, quarter, awayScore, homeScore) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, settings')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can score quarters')
    err.status = 403
    throw err
  }

  const { data: board } = await supabase
    .from('squares_boards')
    .select('*')
    .eq('league_id', leagueId)
    .single()

  if (!board || !board.digits_locked) {
    const err = new Error('Digits must be locked before scoring')
    err.status = 400
    throw err
  }

  // Find winning square position
  const awayDigit = awayScore % 10
  const homeDigit = homeScore % 10

  // row_digits maps position -> digit for away team (rows)
  // col_digits maps position -> digit for home team (columns)
  const winningRow = board.row_digits.indexOf(awayDigit)
  const winningCol = board.col_digits.indexOf(homeDigit)

  // Find who owns that square
  const { data: claim } = await supabase
    .from('squares_claims')
    .select('user_id')
    .eq('board_id', board.id)
    .eq('row_pos', winningRow)
    .eq('col_pos', winningCol)
    .single()

  const winnerId = claim?.user_id || null

  // Update board with quarter scores and winner
  const qPrefix = `q${quarter}`
  const updates = {
    [`${qPrefix}_away_score`]: awayScore,
    [`${qPrefix}_home_score`]: homeScore,
    [`${qPrefix}_winner_id`]: winnerId,
    updated_at: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from('squares_boards')
    .update(updates)
    .eq('id', board.id)

  if (updateError) {
    logger.error({ updateError }, 'Failed to update quarter scores')
    throw updateError
  }

  // Squares do not affect the user's global total_points
  if (winnerId) {
    const pointsPerQuarter = league.settings?.points_per_quarter || [25, 25, 25, 50]
    const points = pointsPerQuarter[quarter - 1] || 25
    logger.info({ winnerId, quarter, points, leagueId }, 'Squares quarter winner determined')
  }

  return { quarter, awayScore, homeScore, winningRow, winningCol, winnerId }
}
