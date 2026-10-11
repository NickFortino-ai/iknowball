// IKB Arcade.
//
// Scores here are deliberately NOT IKB points. total_points, tiers and the
// record book are earned on predictions; a memory game must not move someone
// up a tier. Each game keeps its own leaderboard, per variant.
import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth)

const MEMORY = 'memory'

// Pair counts we deal. Four columns is the mobile ceiling — at 375px wide a
// fifth column puts cards under ~65px, too small to recognise a backdrop,
// which defeats a memory game. So difficulty adds ROWS, and past 10 pairs it
// has to come from somewhere other than grid size (shorter peek, a single
// sport so the images look alike).
const PAIR_COUNTS = { easy: 6, medium: 8, hard: 10 }

// Scoring. Deliberately explainable on screen rather than a mystery number:
//   +100  per matched pair
//    -25  per INFORMED miss
//     +3  per second under par, par = 6s per pair
//
// An informed miss is one where the second card flipped had already been
// revealed earlier in the round. At that moment the player knows what both
// cards are, so they knew it wouldn't match. Flipping two cards you have
// never seen is information gathering and costs nothing — exploring is free,
// forgetting is not.
const POINTS_PER_PAIR = 100
const PENALTY_PER_INFORMED_MISS = 25
const PAR_SECONDS_PER_PAIR = 6
const TIME_BONUS_PER_SECOND = 3

function scoreRound({ pairs, informedMisses, durationMs }) {
  const base = pairs * POINTS_PER_PAIR
  const penalty = informedMisses * PENALTY_PER_INFORMED_MISS
  const parSeconds = pairs * PAR_SECONDS_PER_PAIR
  const elapsedSeconds = durationMs / 1000
  const timeBonus = Math.max(0, Math.round((parSeconds - elapsedSeconds) * TIME_BONUS_PER_SECOND))
  return {
    score: Math.max(0, base - penalty + timeBonus),
    breakdown: { base, penalty, timeBonus, parSeconds, elapsedSeconds: Math.round(elapsedSeconds) },
  }
}

// Deal a round.
//
// The deck comes from league_backdrops — 220 labelled, sport-tagged images we
// already ship. `variant` filters on the `formats` array, so "per sport" is
// free; 'all' draws from everything.
router.post('/memory/start', async (req, res, next) => {
  try {
    const difficulty = String(req.body?.difficulty || 'medium').toLowerCase()
    const pairs = PAIR_COUNTS[difficulty]
    if (!pairs) return res.status(400).json({ error: 'difficulty must be easy, medium or hard' })
    const variant = String(req.body?.variant || 'all')

    let query = supabase.from('league_backdrops').select('filename, label, formats')
    if (variant !== 'all') query = query.contains('formats', [variant])
    const { data: pool, error } = await query
    if (error) throw error

    if (!pool?.length || pool.length < pairs) {
      return res.status(400).json({
        error: `Not enough images for that set — it has ${pool?.length || 0}, this round needs ${pairs}.`,
      })
    }

    // Fisher-Yates over a copy, then take the first `pairs`.
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const chosen = shuffled.slice(0, pairs)

    const { data: round, error: roundErr } = await supabase
      .from('arcade_rounds')
      .insert({ user_id: req.user.id, game_key: MEMORY, variant, pairs })
      .select('id, started_at')
      .single()
    if (roundErr) throw roundErr

    // Two cards per image, shuffled together. Card ids are positional, and
    // `pairKey` is what the client matches on.
    const cards = []
    for (const img of chosen) {
      cards.push({ pairKey: img.filename, filename: img.filename, label: img.label })
      cards.push({ pairKey: img.filename, filename: img.filename, label: img.label })
    }
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[cards[i], cards[j]] = [cards[j], cards[i]]
    }

    res.json({
      roundId: round.id,
      pairs,
      difficulty,
      variant,
      parSeconds: pairs * PAR_SECONDS_PER_PAIR,
      cards: cards.map((c, i) => ({ id: i, ...c })),
    })
  } catch (err) {
    next(err)
  }
})

// Finish a round and record the score.
//
// Duration is computed from the round's server-written started_at, never from
// anything the client sends — otherwise the leaderboard is an honour system
// and a "0.4s" round tops it forever. This cannot make a client-side memory
// game uncheatable (the deck is in the network tab), but it bounds the absurd.
router.post('/memory/finish', async (req, res, next) => {
  try {
    const { roundId } = req.body || {}
    const moves = Number(req.body?.moves)
    const informedMisses = Number(req.body?.informedMisses)
    if (!roundId) return res.status(400).json({ error: 'roundId required' })
    if (!Number.isFinite(moves) || moves < 0) return res.status(400).json({ error: 'moves must be a number' })
    if (!Number.isFinite(informedMisses) || informedMisses < 0) {
      return res.status(400).json({ error: 'informedMisses must be a number' })
    }

    const { data: round } = await supabase
      .from('arcade_rounds')
      .select('id, user_id, game_key, variant, pairs, started_at, finished_at')
      .eq('id', roundId)
      .maybeSingle()

    if (!round) return res.status(404).json({ error: 'Round not found' })
    if (round.user_id !== req.user.id) return res.status(403).json({ error: 'Not your round' })
    if (round.finished_at) return res.status(409).json({ error: 'Round already finished' })

    // A round cannot be cleared in fewer attempts than it has pairs, and a
    // miss is an attempt too. Anything below that is a malformed or forged
    // client report, so refuse rather than store a nonsense leaderboard row.
    if (moves < round.pairs) {
      return res.status(400).json({ error: 'Move count is below the minimum for this round' })
    }
    if (informedMisses > moves) {
      return res.status(400).json({ error: 'Miss count exceeds move count' })
    }

    const durationMs = Date.now() - new Date(round.started_at).getTime()
    const { score, breakdown } = scoreRound({ pairs: round.pairs, informedMisses, durationMs })

    await supabase
      .from('arcade_rounds')
      .update({ finished_at: new Date().toISOString() })
      .eq('id', round.id)

    const { data: saved, error: saveErr } = await supabase
      .from('arcade_scores')
      .insert({
        user_id: req.user.id,
        round_id: round.id,
        game_key: round.game_key,
        variant: round.variant,
        score,
        pairs: round.pairs,
        moves,
        informed_misses: informedMisses,
        duration_ms: durationMs,
      })
      .select('id, score, created_at')
      .single()
    if (saveErr) throw saveErr

    // Personal best for this game+variant, so the result screen can say
    // whether this round beat it.
    const { data: best } = await supabase
      .from('arcade_scores')
      .select('score')
      .eq('user_id', req.user.id)
      .eq('game_key', round.game_key)
      .eq('variant', round.variant)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle()

    res.json({
      saved: true,
      id: saved.id,
      score,
      breakdown,
      durationMs,
      personalBest: best?.score ?? score,
      isPersonalBest: (best?.score ?? 0) <= score,
    })
  } catch (err) {
    next(err)
  }
})

// Leaderboard for one game + variant: each player's BEST round, not every
// round they have ever played — otherwise one person fills the board.
router.get('/leaderboard', async (req, res, next) => {
  try {
    const gameKey = String(req.query.game || MEMORY)
    const variant = String(req.query.variant || 'all')
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 100)

    const { data: rows, error } = await supabase
      .from('arcade_scores')
      .select('user_id, score, pairs, moves, informed_misses, duration_ms, created_at, users(username, display_name, avatar_url, avatar_emoji)')
      .eq('game_key', gameKey)
      .eq('variant', variant)
      .order('score', { ascending: false })
      .order('duration_ms', { ascending: true })
      .limit(500)
    if (error) throw error

    // Best per user. Rows arrive best-first, so the first one seen wins.
    const bestByUser = new Map()
    for (const r of rows || []) {
      if (!bestByUser.has(r.user_id)) bestByUser.set(r.user_id, r)
    }
    const board = [...bestByUser.values()].slice(0, limit).map((r, i) => ({
      rank: i + 1,
      user_id: r.user_id,
      username: r.users?.username,
      display_name: r.users?.display_name,
      avatar_url: r.users?.avatar_url,
      avatar_emoji: r.users?.avatar_emoji,
      score: r.score,
      pairs: r.pairs,
      moves: r.moves,
      informed_misses: r.informed_misses,
      duration_ms: r.duration_ms,
      created_at: r.created_at,
    }))

    const mine = board.find((b) => b.user_id === req.user.id) || null
    res.json({ game: gameKey, variant, board, me: mine })
  } catch (err) {
    next(err)
  }
})

// The variants a game can be played in, with how many images each set has.
// Sets smaller than the hardest difficulty are still returned, with their
// count, so the client can disable difficulties that don't fit.
router.get('/memory/variants', async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from('league_backdrops').select('formats')
    if (error) throw error
    const counts = new Map()
    for (const row of data || []) {
      for (const f of row.formats || []) counts.set(f, (counts.get(f) || 0) + 1)
    }
    const variants = [{ key: 'all', count: (data || []).length }]
    for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      if (count >= PAIR_COUNTS.easy) variants.push({ key, count })
    }
    res.json({ variants, pairCounts: PAIR_COUNTS })
  } catch (err) {
    next(err)
  }
})

export default router
