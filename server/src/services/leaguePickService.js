import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { calculateRiskPoints, calculateRewardPoints } from '../utils/scoring.js'

export async function submitLeaguePick(leagueId, userId, weekId, gameId, pickedTeam) {
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

  // Verify league is pick'em with use_league_picks
  const { data: league } = await supabase
    .from('leagues')
    .select('id, format, use_league_picks, sport, settings')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  if (league.format !== 'pickem' || !league.use_league_picks) {
    const err = new Error('This league does not support league picks')
    err.status = 400
    throw err
  }

  // Verify game exists and hasn't started
  const { data: game } = await supabase
    .from('games')
    .select('id, status, starts_at, home_odds, away_odds, sport_id, sports(key)')
    .eq('id', gameId)
    .single()

  if (!game) {
    const err = new Error('Game not found')
    err.status = 404
    throw err
  }

  if (game.status !== 'upcoming') {
    const err = new Error('Game has already started — picks are locked')
    err.status = 400
    throw err
  }

  if (new Date(game.starts_at) <= new Date()) {
    const err = new Error('Game has already started — picks are locked')
    err.status = 400
    throw err
  }

  // Verify game sport matches league sport (or league is 'all')
  if (league.sport !== 'all' && game.sports?.key !== league.sport) {
    const err = new Error('This game does not match the league sport')
    err.status = 400
    throw err
  }

  // Verify game falls within the league week's date range
  const { data: week } = await supabase
    .from('league_weeks')
    .select('id, starts_at, ends_at')
    .eq('id', weekId)
    .eq('league_id', leagueId)
    .single()

  if (!week) {
    const err = new Error('Invalid week for this league')
    err.status = 400
    throw err
  }

  if (game.starts_at < week.starts_at || game.starts_at > week.ends_at) {
    const err = new Error('This game is not in the selected week')
    err.status = 400
    throw err
  }

  // If games_per_week set, enforce limit
  const gamesPerWeek = league.settings?.games_per_week
  if (gamesPerWeek) {
    const { count } = await supabase
      .from('league_picks')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .eq('league_week_id', weekId)
      .neq('game_id', gameId) // don't count the game we're upsetting

    if (count >= gamesPerWeek) {
      const err = new Error(`You can only pick ${gamesPerWeek} games per ${league.settings?.pick_frequency === 'daily' ? 'day' : 'week'}`)
      err.status = 400
      throw err
    }
  }

  // Snapshot odds at submission
  const odds = pickedTeam === 'home' ? game.home_odds : game.away_odds
  const oddsAtSubmission = odds || null
  const riskAtSubmission = odds ? calculateRiskPoints(odds) : null
  const rewardAtSubmission = odds ? calculateRewardPoints(odds) : null

  // Upsert pick
  const { data, error } = await supabase
    .from('league_picks')
    .upsert(
      {
        league_id: leagueId,
        user_id: userId,
        league_week_id: weekId,
        game_id: gameId,
        picked_team: pickedTeam,
        status: 'pending',
        odds_at_submission: oddsAtSubmission,
        risk_at_submission: riskAtSubmission,
        reward_at_submission: rewardAtSubmission,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'league_id,user_id,game_id' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to submit league pick')
    throw error
  }

  // Check for existing global pick on same game+team
  const { data: globalPick } = await supabase
    .from('picks')
    .select('id, picked_team')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .single()

  const doubleDown = globalPick?.picked_team === pickedTeam

  return { pick: data, doubleDown }
}

export async function deleteLeaguePick(leagueId, userId, gameId) {
  const { data: pick } = await supabase
    .from('league_picks')
    .select('id, status')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .single()

  if (!pick) {
    const err = new Error('Pick not found')
    err.status = 404
    throw err
  }

  if (pick.status !== 'pending') {
    const err = new Error('Cannot undo a locked or settled pick')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('league_picks')
    .delete()
    .eq('id', pick.id)

  if (error) {
    logger.error({ error }, 'Failed to delete league pick')
    throw error
  }
}

export async function getLeaguePicks(leagueId, userId, weekId) {
  let query = supabase
    .from('league_picks')
    .select('*, games(*, sports(key, name))')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (weekId) {
    query = query.eq('league_week_id', weekId)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getLeagueGames(leagueId, weekId) {
  // Look up league sport + week date range
  const { data: league } = await supabase
    .from('leagues')
    .select('sport')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  const { data: week } = await supabase
    .from('league_weeks')
    .select('starts_at, ends_at')
    .eq('id', weekId)
    .eq('league_id', leagueId)
    .single()

  if (!week) {
    const err = new Error('Week not found')
    err.status = 404
    throw err
  }

  let query = supabase
    .from('games')
    .select('*, sports!inner(key, name)')
    .gte('starts_at', week.starts_at)
    .lte('starts_at', week.ends_at)
    .order('starts_at', { ascending: true })

  if (league.sport !== 'all') {
    query = query.eq('sports.key', league.sport)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function scoreLeaguePicks(gameId, winner) {
  const { data: picks, error } = await supabase
    .from('league_picks')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'locked')

  if (error) {
    logger.error({ error, gameId }, 'Failed to fetch league picks for scoring')
    return
  }

  if (!picks?.length) return

  for (const pick of picks) {
    let isCorrect = null
    let pointsEarned = 0

    if (winner === null) {
      isCorrect = null
      pointsEarned = 0
    } else if (pick.picked_team === winner) {
      isCorrect = true
      pointsEarned = pick.reward_points || 0
    } else {
      isCorrect = false
      pointsEarned = -(pick.risk_points || 0)
    }

    const { error: pickError } = await supabase
      .from('league_picks')
      .update({
        status: 'settled',
        is_correct: isCorrect,
        points_earned: pointsEarned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pick.id)

    if (pickError) {
      logger.error({ pickError, pickId: pick.id }, 'Failed to settle league pick')
    }

    // Do NOT call increment_user_points or update_sport_stats
  }

  logger.info({ gameId, picksScored: picks.length, winner }, 'League picks scored')
}

export async function getLeaguePickStandings(leagueId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .single()

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_emoji, tier)')
    .eq('league_id', leagueId)

  if (!members?.length) return []

  const useSubmissionOdds = league?.settings?.lock_odds_at === 'submission'

  const { data: picks } = await supabase
    .from('league_picks')
    .select('user_id, is_correct, points_earned, reward_at_submission, risk_at_submission')
    .eq('league_id', leagueId)
    .eq('status', 'settled')

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

  return Object.values(statsMap)
    .sort((a, b) => b.total_points - a.total_points)
    .map((s, i) => ({ ...s, rank: i + 1 }))
}
