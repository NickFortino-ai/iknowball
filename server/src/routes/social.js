import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { supabase } from '../config/supabase.js'
import {
  toggleReaction,
  getReactionsForPick,
  getReactionsForPicks,
  addComment,
  getComments,
  deleteComment,
  toggleCommentLike,
  toggleFeedReaction,
  getFeedReactionsBatch,
} from '../services/socialService.js'
import { getPronouns } from '../utils/pronouns.js'

const router = Router()

const reactionSchema = z.object({
  reaction_type: z.enum(['fire', 'clown', 'goat', 'dead', 'clap', 'ice']),
})

router.post('/picks/:pickId/reactions', requireAuth, validate(reactionSchema), async (req, res) => {
  const result = await toggleReaction(req.user.id, req.params.pickId, req.validated.reaction_type)
  res.json(result)
})

router.get('/picks/:pickId/reactions', requireAuth, async (req, res) => {
  const reactions = await getReactionsForPick(req.params.pickId)
  res.json(reactions)
})

router.get('/picks/reactions/batch', requireAuth, async (req, res) => {
  const pickIds = req.query.pickIds ? req.query.pickIds.split(',') : []
  const reactions = await getReactionsForPicks(pickIds)
  res.json(reactions)
})

const commentSchema = z.object({
  content: z.string().min(1).max(280),
  parent_id: z.string().uuid().nullable().optional(),
})

// Pick comments
router.post('/picks/:pickId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'pick', req.params.pickId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/picks/:pickId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('pick', req.params.pickId, req.user.id)
  res.json(comments)
})

// Parlay comments
router.post('/parlays/:parlayId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'parlay', req.params.parlayId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/parlays/:parlayId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('parlay', req.params.parlayId, req.user.id)
  res.json(comments)
})

// Prop pick comments
router.post('/props/:propPickId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'prop', req.params.propPickId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/props/:propPickId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('prop', req.params.propPickId, req.user.id)
  res.json(comments)
})

// Streak event comments
router.post('/streak-events/:streakEventId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'streak_event', req.params.streakEventId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/streak-events/:streakEventId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('streak_event', req.params.streakEventId, req.user.id)
  res.json(comments)
})

// Record history comments
router.post('/records/:recordId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'record_history', req.params.recordId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/records/:recordId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('record_history', req.params.recordId, req.user.id)
  res.json(comments)
})

// Hot take comments
router.post('/hot-takes/:hotTakeId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'hot_take', req.params.hotTakeId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/hot-takes/:hotTakeId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('hot_take', req.params.hotTakeId, req.user.id)
  res.json(comments)
})

// Delete comment (generic — works for any target type)
router.delete('/comments/:commentId', requireAuth, async (req, res) => {
  await deleteComment(req.user.id, req.params.commentId)
  res.status(204).end()
})

// Comment likes
router.post('/comments/:commentId/like', requireAuth, async (req, res) => {
  const result = await toggleCommentLike(req.user.id, req.params.commentId)
  res.json(result)
})

// Feed reactions
const feedReactionSchema = z.object({
  target_type: z.enum(['pick', 'parlay', 'streak_event', 'record_history', 'hot_take']),
  target_id: z.string().uuid(),
  reaction_type: z.enum(['fire', 'clown', 'goat', 'clap']),
})

router.post('/feed/reactions', requireAuth, validate(feedReactionSchema), async (req, res) => {
  const { target_type, target_id, reaction_type } = req.validated
  const result = await toggleFeedReaction(req.user.id, target_type, target_id, reaction_type)
  res.json(result)
})

router.get('/feed/reactions/batch', requireAuth, async (req, res) => {
  let items = []
  try {
    items = JSON.parse(req.query.items || '[]')
  } catch (_) { /* ignore parse errors */ }
  const reactions = await getFeedReactionsBatch(items)
  res.json(reactions)
})

// Streak detail
router.get('/streaks/:streakId', requireAuth, async (req, res) => {
  const { streakId } = req.params

  // 1. Fetch the streak event
  const { data: streakEvent, error } = await supabase
    .from('streak_events')
    .select('id, user_id, sport_id, streak_length, created_at, sports(key, name)')
    .eq('id', streakId)
    .single()

  if (error || !streakEvent) {
    return res.status(404).json({ error: 'Streak not found' })
  }

  // 2. Get current streak for this user+sport
  const { data: stats } = await supabase
    .from('user_sport_stats')
    .select('current_streak')
    .eq('user_id', streakEvent.user_id)
    .eq('sport_id', streakEvent.sport_id)
    .single()

  const currentStreak = stats?.current_streak || 0
  const isActive = currentStreak >= streakEvent.streak_length

  // 3. Get the picks that formed this streak
  const { data: picks } = await supabase
    .from('picks')
    .select('id, picked_team, odds_at_lock, points_earned, updated_at, games!inner(home_team, away_team, starts_at, sport_id, sports(key, name))')
    .eq('user_id', streakEvent.user_id)
    .eq('games.sport_id', streakEvent.sport_id)
    .eq('status', 'settled')
    .eq('is_correct', true)
    .lte('updated_at', streakEvent.created_at)
    .order('updated_at', { ascending: false })
    .limit(streakEvent.streak_length)

  // Reverse so oldest pick is first (chronological order)
  const orderedPicks = (picks || []).reverse()

  res.json({
    streakEvent,
    currentStreak: isActive ? currentStreak : streakEvent.streak_length,
    isActive,
    picks: orderedPicks,
  })
})

// Head-to-head rivalry history
router.get('/head-to-head/:userAId/:userBId', requireAuth, async (req, res) => {
  const { userAId, userBId } = req.params

  // 1. Fetch both users' profiles
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji, title_preference, total_points')
    .in('id', [userAId, userBId])

  if (usersError || !users || users.length < 2) {
    return res.status(404).json({ error: 'One or both users not found' })
  }

  const userA = users.find(u => u.id === userAId)
  const userB = users.find(u => u.id === userBId)

  // 2. Find shared game_ids — lightweight per-user queries to avoid row limits
  const [picksAResult, picksBResult] = await Promise.all([
    supabase.from('picks').select('game_id, picked_team').eq('user_id', userAId).eq('status', 'settled').limit(5000),
    supabase.from('picks').select('game_id, picked_team').eq('user_id', userBId).eq('status', 'settled').limit(5000),
  ])

  const picksAByGame = {}
  for (const p of picksAResult.data || []) {
    if (p.game_id) picksAByGame[p.game_id] = p.picked_team
  }

  // Find game_ids where both picked opposite sides
  const sharedGameIds = []
  for (const p of picksBResult.data || []) {
    if (p.game_id && picksAByGame[p.game_id] && picksAByGame[p.game_id] !== p.picked_team) {
      sharedGameIds.push(p.game_id)
    }
  }

  const games = []
  let userAWins = 0
  let userBWins = 0
  let ties = 0

  if (sharedGameIds.length > 0) {
    // 3. Fetch full pick details only for shared games
    const { data: sharedPicks } = await supabase
      .from('picks')
      .select('id, user_id, game_id, picked_team, is_correct, points_earned, risk_points, updated_at, games(home_team, away_team, starts_at, sports(name))')
      .in('user_id', [userAId, userBId])
      .in('game_id', sharedGameIds)
      .eq('status', 'settled')

    const picksByGame = {}
    for (const pick of sharedPicks || []) {
      if (!pick.game_id) continue
      if (!picksByGame[pick.game_id]) picksByGame[pick.game_id] = {}
      picksByGame[pick.game_id][pick.user_id] = pick
    }

    for (const [gameId, userPicks] of Object.entries(picksByGame)) {
      const pickA = userPicks[userAId]
      const pickB = userPicks[userBId]
      if (!pickA || !pickB) continue

      let winnerId = null
      if (pickA.is_correct && !pickB.is_correct) {
        userAWins++
        winnerId = userAId
      } else if (pickB.is_correct && !pickA.is_correct) {
        userBWins++
        winnerId = userBId
      } else {
        ties++
      }

      games.push({
        game_id: gameId,
        home_team: pickA.games?.home_team,
        away_team: pickA.games?.away_team,
        sport_name: pickA.games?.sports?.name,
        date: pickA.games?.starts_at,
        winner_id: winnerId,
        userA_team: pickA.picked_team === 'home' ? pickA.games?.home_team : pickA.games?.away_team,
        userB_team: pickB.picked_team === 'home' ? pickB.games?.home_team : pickB.games?.away_team,
        userA_correct: pickA.is_correct,
        userB_correct: pickB.is_correct,
      })
    }
  }

  // Sort most recent first
  games.sort((a, b) => new Date(b.date) - new Date(a.date))

  // 4. Generate rivalry narrative
  const narrative = generateRivalryNarrative(userA, userB, userAWins, userBWins, ties, games)

  res.json({
    userA: { id: userA.id, username: userA.username, display_name: userA.display_name, avatar_url: userA.avatar_url, avatar_emoji: userA.avatar_emoji },
    userB: { id: userB.id, username: userB.username, display_name: userB.display_name, avatar_url: userB.avatar_url, avatar_emoji: userB.avatar_emoji },
    userAWins,
    userBWins,
    ties,
    games,
    narrative,
  })
})

function generateRivalryNarrative(userA, userB, userAWins, userBWins, ties, games) {
  const total = userAWins + userBWins + ties
  if (total === 0) return 'No head-to-head history yet.'

  const nameA = userA.display_name || userA.username
  const nameB = userB.display_name || userB.username

  // Determine leader/trailer
  const aLeads = userAWins > userBWins
  const tied = userAWins === userBWins
  const leader = aLeads ? userA : userB
  const trailer = aLeads ? userB : userA
  const leaderName = leader.display_name || leader.username
  const trailerName = trailer.display_name || trailer.username
  const leaderWins = Math.max(userAWins, userBWins)
  const trailerWins = Math.min(userAWins, userBWins)
  const winPct = total > 0 ? leaderWins / total : 0
  const pronouns = getPronouns(leader.title_preference)

  // Compute streaks from most recent games
  let leaderStreak = 0
  let trailerStreak = 0
  const leaderId = aLeads ? userA.id : userB.id
  const trailerId = aLeads ? userB.id : userA.id
  for (const g of games) {
    if (g.winner_id === leaderId) {
      if (trailerStreak > 0) break
      leaderStreak++
    } else if (g.winner_id === trailerId) {
      if (leaderStreak > 0) break
      trailerStreak++
    } else {
      break
    }
  }

  // Leaderboard positions
  const leaderRank = leader.total_points || 0
  const trailerRank = trailer.total_points || 0

  // New rivalry
  if (total < 3) {
    const templates = [
      'This rivalry is just getting started.',
      `Only ${total} matchup${total > 1 ? 's' : ''} in, but this one's heating up.`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  // Tied
  if (tied) {
    const templates = [
      `Dead even at ${userAWins}-${userBWins}.`,
      `This rivalry is as close as it gets — tied ${userAWins}-${userBWins}.`,
      `Neither one can pull away — locked at ${userAWins}-${userBWins}.`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  // Dominant (70%+ win rate, 5+ games)
  if (winPct >= 0.7 && total >= 5) {
    const templates = [
      `${leaderName} owns this rivalry.`,
      `${leaderName} has ${pronouns.possessive} way with ${trailerName} at ${leaderWins}-${trailerWins}.`,
      `It's been all ${leaderName} — ${leaderWins}-${trailerWins} and counting.`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  // Streak (3+ consecutive wins by either)
  if (leaderStreak >= 3) {
    const templates = [
      `${leaderName} has won the last ${leaderStreak} head-to-head matchups.`,
      `${leaderName} is on a tear — ${leaderStreak} straight over ${trailerName}.`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  // Comeback (trailer won last 2+ while trailing overall)
  if (trailerStreak >= 2) {
    const templates = [
      `${trailerName} is closing the gap, winning the last ${trailerStreak}.`,
      `Momentum has shifted — ${trailerName} has taken the last ${trailerStreak}.`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  // Leaderboard upset (h2h leader trails on leaderboard)
  if (leaderRank < trailerRank) {
    const templates = [
      `${leaderName} may sit lower on the leaderboard, but ${pronouns.subject} has ${trailerName}'s number.`,
      `Don't let the standings fool you — ${leaderName} leads this rivalry ${leaderWins}-${trailerWins}.`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  // Close (1-game difference)
  if (leaderWins - trailerWins === 1) {
    const templates = [
      `Separated by a single game at ${leaderWins}-${trailerWins}.`,
      `${leaderName} holds the slimmest of edges at ${leaderWins}-${trailerWins}.`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  // Lots of history (15+ games)
  if (total >= 15) {
    const templates = [
      `These two have been at it — ${total} matchups and counting.`,
      `${total} games deep into this rivalry.`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  // General competitive
  const templates = [
    `${leaderName} leads ${leaderWins}-${trailerWins}, but ${trailerName} won't go away.`,
    `A competitive rivalry — ${leaderName} edges ${trailerName} ${leaderWins}-${trailerWins}.`,
  ]
  return templates[Math.floor(Math.random() * templates.length)]
}

export default router
