// IKB Arcade.
//
// Scores here are deliberately NOT IKB points. total_points, tiers and the
// record book are earned on predictions; a memory game must not move someone
// up a tier. Each game keeps its own leaderboard, per variant.
import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'
import { buildRound } from '../services/triviaService.js'
import { fetchAll } from '../utils/fetchAll.js'

const router = Router()
router.use(requireAuth)

const MEMORY = 'memory'
const TRIVIA = 'trivia'

// Questions per round, and what each is worth.
const TRIVIA_QUESTIONS = 8
// Harder questions pay more, so clearing a 5 isn't level with clearing a 1.
// Kept a modest spread (10..20) — difficulty should tilt a close round, not
// make the easy ones pointless to answer.
const POINTS_FOR_DIFFICULTY = { 1: 10, 2: 13, 3: 15, 4: 18, 5: 20 }
const POINTS_PER_CORRECT = 13 // used when a question carries no ranking
// Answering fast is worth something, but not so much that it beats being
// right — a perfect slow round still outscores a fast half-wrong one.
const TRIVIA_PAR_SECONDS_PER_Q = 12
const TRIVIA_BONUS_PER_SECOND = 0.2

// Pair counts we deal. Four columns is the mobile ceiling — at 375px wide a
// fifth column puts cards under ~65px, too small to recognise a backdrop,
// which defeats a memory game. So difficulty adds ROWS, and past 10 pairs it
// has to come from somewhere other than grid size (shorter peek, a single
// sport so the images look alike).
const PAIR_COUNTS = { easy: 6, medium: 8, hard: 10 }

// Scoring. Deliberately explainable on screen rather than a mystery number:
//    +10  per matched pair
//   -2.5  per INFORMED miss
//   +0.3  per second under par, par = 6s per pair
//
// A tenth of what it was. The old scale put a decent round at 775 and a
// career total well into five figures, which is a lot of digits on a
// leaderboard to say "better than 740". Every weight is divided equally, so
// the strategy is untouched and only the units changed.
//
// An informed miss is one where the second card flipped had already been
// revealed earlier in the round. At that moment the player knows what both
// cards are, so they knew it wouldn't match. Flipping two cards you have
// never seen is information gathering and costs nothing — exploring is free,
// forgetting is not.
const POINTS_PER_PAIR = 10
const PENALTY_PER_INFORMED_MISS = 2.5
const PAR_SECONDS_PER_PAIR = 6
const TIME_BONUS_PER_SECOND = 0.3

function scoreRound({ pairs, informedMisses, durationMs }) {
  const base = pairs * POINTS_PER_PAIR
  // Rounded here, not just in the total: the breakdown is shown on the
  // result screen and has to add up to the score, or the scoring reads as
  // arbitrary the first time a half point disappears.
  const penalty = Math.round(informedMisses * PENALTY_PER_INFORMED_MISS)
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

// Deal a trivia round.
//
// The answers are deliberately NOT in the response. They are held in
// arcade_rounds.payload and scored server-side on finish — a quiz that ships
// its own answer key is not a quiz.
router.post('/trivia/start', async (req, res, next) => {
  try {
    const variant = String(req.body?.variant || 'all')
    const questions = await buildRound({ sport: variant, count: TRIVIA_QUESTIONS })
    if (questions.length < 2) {
      return res.status(503).json({ error: 'Not enough questions available for that sport yet.' })
    }

    const { data: round, error } = await supabase
      .from('arcade_rounds')
      .insert({
        user_id: req.user.id,
        game_key: TRIVIA,
        variant,
        pairs: questions.length, // reused as "question count" for this game
        payload: {
          answers: questions.map((q) => q.answerIndex),
          explanations: questions.map((q) => q.explanation || null),
          questionIds: questions.map((q) => q.id || null),
          difficulties: questions.map((q) => q.difficulty ?? 2),
        },
      })
      .select('id')
      .single()
    if (error) throw error

    res.json({
      roundId: round.id,
      variant,
      parSeconds: questions.length * TRIVIA_PAR_SECONDS_PER_Q,
      questions: questions.map((q) => ({
        question: q.question,
        choices: q.choices,
        sport: q.sport,
        difficulty: q.difficulty ?? 2,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// Score a trivia round. The client sends only its chosen indexes.
router.post('/trivia/finish', async (req, res, next) => {
  try {
    const { roundId } = req.body || {}
    const answers = req.body?.answers
    if (!roundId) return res.status(400).json({ error: 'roundId required' })
    if (!Array.isArray(answers)) return res.status(400).json({ error: 'answers must be an array' })

    const { data: round } = await supabase
      .from('arcade_rounds')
      .select('id, user_id, game_key, variant, pairs, started_at, finished_at, payload')
      .eq('id', roundId)
      .maybeSingle()

    if (!round) return res.status(404).json({ error: 'Round not found' })
    if (round.user_id !== req.user.id) return res.status(403).json({ error: 'Not your round' })
    if (round.finished_at) return res.status(409).json({ error: 'Round already finished' })

    const correctAnswers = round.payload?.answers || []
    const explanations = round.payload?.explanations || []
    const results = correctAnswers.map((correct, i) => ({
      correct,
      chosen: Number.isInteger(answers[i]) ? answers[i] : null,
      wasRight: answers[i] === correct,
      explanation: explanations[i] || null,
    }))
    const correctCount = results.filter((r) => r.wasRight).length
    const difficulties = round.payload?.difficulties || []

    const durationMs = Date.now() - new Date(round.started_at).getTime()
    const parSeconds = correctAnswers.length * TRIVIA_PAR_SECONDS_PER_Q
    const base = results.reduce((sum, r, i) => {
      if (!r.wasRight) return sum
      return sum + (POINTS_FOR_DIFFICULTY[difficulties[i]] ?? POINTS_PER_CORRECT)
    }, 0)
    const timeBonus = correctCount === 0
      ? 0 // no reward for racing through and getting nothing right
      : Math.max(0, Math.round((parSeconds - durationMs / 1000) * TRIVIA_BONUS_PER_SECOND))
    const score = Math.max(0, base + timeBonus)

    await supabase.from('arcade_rounds').update({ finished_at: new Date().toISOString() }).eq('id', round.id)

    const { error: saveErr } = await supabase.from('arcade_scores').insert({
      user_id: req.user.id,
      round_id: round.id,
      game_key: TRIVIA,
      variant: round.variant,
      score,
      pairs: correctAnswers.length,
      moves: correctCount,
      duration_ms: durationMs,
    })
    if (saveErr) throw saveErr

    // Per-question stats, for the AUTHORED questions only (generated ones have
    // no row to count against) — tells you which hand-written questions are
    // too easy or too hard to keep.
    //
    // Read-then-write rather than an atomic increment: PostgREST can't express
    // `col = col + 1` without a database function, and inventing an RPC that
    // doesn't exist yet would be a call into nothing. A lost count under
    // concurrency is acceptable for what is a curation hint, not a ledger.
    const ids = round.payload?.questionIds || []
    const authoredIds = ids.filter(Boolean)
    if (authoredIds.length) {
      const { data: current } = await supabase
        .from('trivia_questions')
        .select('id, times_served, times_correct')
        .in('id', authoredIds)
      const byId = Object.fromEntries((current || []).map((r) => [r.id, r]))
      for (let i = 0; i < ids.length; i++) {
        const row = ids[i] && byId[ids[i]]
        if (!row) continue
        await supabase
          .from('trivia_questions')
          .update({
            times_served: (row.times_served || 0) + 1,
            times_correct: (row.times_correct || 0) + (results[i]?.wasRight ? 1 : 0),
          })
          .eq('id', row.id)
      }
    }

    const { data: best } = await supabase
      .from('arcade_scores')
      .select('score')
      .eq('user_id', req.user.id).eq('game_key', TRIVIA).eq('variant', round.variant)
      .order('score', { ascending: false }).limit(1).maybeSingle()

    res.json({
      saved: true,
      score,
      correctCount,
      total: correctAnswers.length,
      breakdown: { base, timeBonus, parSeconds, elapsedSeconds: Math.round(durationMs / 1000) },
      results,
      personalBest: best?.score ?? score,
      isPersonalBest: (best?.score ?? 0) <= score,
    })
  } catch (err) {
    next(err)
  }
})

// Leaderboard for one game + variant: each player's BEST round, not every
// round they have ever played — otherwise one person fills the board.
//
// game='overall' instead ranks the arcade as a whole: a player's best round
// in EACH game, added up.
//
// Best-per-game rather than every-point-ever on purpose. Summing all rounds
// would rank by how much someone has played, which makes the board a
// stopwatch rather than a scoreboard and is unbeatable for anyone arriving
// late. Best-per-game rewards breadth — playing both beats grinding one —
// and stays the same measure the per-game tabs use, so a player can see
// exactly which number of theirs is carried up into the total.
router.get('/leaderboard', async (req, res, next) => {
  try {
    const gameKey = String(req.query.game || MEMORY)
    const variant = String(req.query.variant || 'all')
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 100)

    if (gameKey === 'overall') {
      // Across every game AND every variant: a memory best is a memory best
      // whichever image set it was set on.
      const rows = await fetchAll(
        supabase
          .from('arcade_scores')
          .select('user_id, game_key, score, created_at, users(username, display_name, avatar_url, avatar_emoji)')
          .order('user_id')
      )

      const byUser = new Map()
      for (const r of rows) {
        let u = byUser.get(r.user_id)
        if (!u) {
          u = { user: r.users, best: {} }
          byUser.set(r.user_id, u)
        }
        if (!(u.best[r.game_key] >= r.score)) u.best[r.game_key] = r.score
      }

      const board = [...byUser.entries()]
        .map(([userId, u]) => ({
          user_id: userId,
          username: u.user?.username,
          display_name: u.user?.display_name,
          avatar_url: u.user?.avatar_url,
          avatar_emoji: u.user?.avatar_emoji,
          score: Object.values(u.best).reduce((a, b) => a + b, 0),
          breakdown: u.best,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((r, i) => ({ rank: i + 1, ...r }))

      const mine = board.find((b) => b.user_id === req.user.id) || null
      return res.json({ game: 'overall', variant: null, board, me: mine })
    }

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
    const { data, error } = await supabase.from('league_backdrops').select('filename, formats')
    if (error) throw error
    const counts = new Map()
    // A few filenames per variant so the arcade tile can show the actual
    // images a round would deal, rather than a generic illustration of a
    // game we already own 220 pictures for.
    const samples = new Map()
    for (const row of data || []) {
      for (const f of row.formats || []) {
        counts.set(f, (counts.get(f) || 0) + 1)
        const s = samples.get(f) || []
        if (s.length < 4) { s.push(row.filename); samples.set(f, s) }
      }
    }
    const variants = [{
      key: 'all',
      count: (data || []).length,
      samples: (data || []).slice(0, 4).map((r) => r.filename),
    }]
    for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      if (count >= PAIR_COUNTS.easy) variants.push({ key, count, samples: samples.get(key) || [] })
    }
    // Trivia's readiness rides along on this request rather than getting its
    // own endpoint: the arcade room fetches this once to build its tiles, and
    // a tile that launches into "not enough questions yet" is worse than a
    // tile that says so up front. One integer, one extra count, no round trip.
    const { count: triviaPublished } = await supabase
      .from('trivia_questions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')

    res.json({ variants, pairCounts: PAIR_COUNTS, trivia: { published: triviaPublished || 0 } })
  } catch (err) {
    next(err)
  }
})

export default router
