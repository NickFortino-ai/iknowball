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
// Streak keeps its OWN board. A streak score and a 20-question score are
// different units — one measures how far you got, the other how well you did
// over a fixed set — and putting them on one table would rank the mode
// rather than the player.
const TRIVIA_STREAK = 'trivia_streak'
// A streak draws from the WHOLE published pool, not a slice of it. 40 was an
// arbitrary number of mine, and an arbitrary number is a cap: with 110
// questions published, "cleared the board" at 40 would have ended a run that
// could have kept going. buildRound deals what exists and no more, so this
// ceiling only binds once the pool passes it.
const STREAK_QUEUE = 500

// Seconds to answer one question.
//
// You cannot stop someone searching for the answer on a web app — tab-blur
// detection is beaten by a second phone and punishes an honest person taking
// a call. A deadline is the instrument that actually works: twenty seconds
// is comfortable for a fact you know and impractical for a search, read and
// return.
//
// A DEADLINE, not a speed bonus. A bonus rewards haste and pushes people to
// guess quickly at a question they could have reasoned out; this only bounds
// the window. The fixed round keeps its separate time bonus, which is scored
// over the whole round rather than per question.
//
// Timed from when the SERVER handed the question over, because a
// client-reported clock is the first thing someone looking up an answer
// would fake. A couple of seconds of slack absorbs the round trip.
// A sport is only worth offering if it can fill the longest fixed round
// without repeating itself. Below that it is a category that deals the same
// handful every time, which is worse than not having it.
const TRIVIA_MIN_FOR_SPORT = 20

const QUESTION_SECONDS = 20
const QUESTION_GRACE_MS = 2500

// Round lengths on offer. A short round is the default commitment and a
// long one is for someone who wants to sit with it; this list is the single
// source of truth, so a third length is one entry here and one more button
// on the intro.
const TRIVIA_COUNTS = [10, 20]
const TRIVIA_QUESTIONS = TRIVIA_COUNTS[0]
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
    // Optional: rounds from clients that predate recall tracking send
    // nothing, and null is the honest value for those rather than 0/0.
    const rawChances = req.body?.recallChances
    const rawHits = req.body?.recallHits
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

    // Recall is bounded by the board: a pair can offer at most one first
    // chance, and you cannot take more chances than you were given. Refuse
    // rather than store a percentage above 100.
    let recallChances = null
    let recallHits = null
    if (rawChances !== undefined && rawChances !== null) {
      recallChances = Number(rawChances)
      recallHits = Number(rawHits ?? 0)
      const sane = Number.isInteger(recallChances) && Number.isInteger(recallHits)
        && recallChances >= 0 && recallHits >= 0
        && recallHits <= recallChances && recallChances <= round.pairs
      if (!sane) return res.status(400).json({ error: 'Recall counts are out of range for this round' })
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
        recall_chances: recallChances,
        recall_hits: recallHits,
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
    // Validated against the offered lengths rather than trusted: `count`
    // decides how many questions a round is worth, so an arbitrary number
    // would be an arbitrary score.
    const requested = req.body?.count === undefined ? TRIVIA_QUESTIONS : Number(req.body.count)
    if (!TRIVIA_COUNTS.includes(requested)) {
      return res.status(400).json({ error: `count must be one of ${TRIVIA_COUNTS.join(', ')}` })
    }
    // Deals short rather than refusing when the pool cannot fill the length
    // asked for — par and scoring both read questions.length, so a short
    // round is priced as the short round it is.
    const questions = await buildRound({ sport: variant, count: requested })
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

// Deal a STREAK round: answer until you miss one.
//
// The whole queue is dealt up front and held server-side, with questions
// handed out one at a time by /trivia/answer — the client never holds a
// question it has not reached, let alone an answer.
//
// Ordered easiest-first like the fixed round, which here means the run gets
// harder the longer it goes. That is the shape of the mode: it should end
// because the questions beat you, not because the list ran out.
router.post('/trivia/streak/start', async (req, res, next) => {
  try {
    const variant = String(req.body?.variant || 'all')
    const questions = await buildRound({ sport: variant, count: STREAK_QUEUE })
    if (questions.length < 2) {
      return res.status(503).json({ error: 'Not enough questions available for that sport yet.' })
    }

    const { data: round, error } = await supabase
      .from('arcade_rounds')
      .insert({
        user_id: req.user.id,
        game_key: TRIVIA_STREAK,
        variant,
        pairs: questions.length,
        payload: {
          answers: questions.map((q) => q.answerIndex),
          explanations: questions.map((q) => q.explanation || null),
          questionIds: questions.map((q) => q.id || null),
          difficulties: questions.map((q) => q.difficulty ?? 2),
          given: [],
          // The clock on the first question starts here, with the insert.
          // It used to be a follow-up update spreading `round.payload` — but
          // the insert selects only `id`, so that spread was undefined and
          // the update replaced the whole payload with a lone timestamp.
          // Every answer and the entire queue were wiped, and the first
          // answer came back "No such question in this round".
          servedAt: { 0: Date.now() },
          // The dealt queue, WITHOUT the answers. buildRound shuffles each
          // question's choices per round and the stored answer index refers
          // to that shuffled order — so re-reading the question from the
          // table later would hand back the original order and point the
          // answer at the wrong choice.
          queue: questions.map((q) => ({
            question: q.question, choices: q.choices, sport: q.sport, difficulty: q.difficulty ?? 2,
          })),
        },
      })
      .select('id')
      .single()
    if (error) throw error

    res.json({
      roundId: round.id,
      variant,
      seconds: QUESTION_SECONDS,
      total: questions.length,
      // One question. The next arrives only after this one is answered.
      question: {
        question: questions[0].question,
        choices: questions[0].choices,
        sport: questions[0].sport,
        difficulty: questions[0].difficulty ?? 2,
      },
    })
  } catch (err) {
    next(err)
  }
})

// The next question in a streak round, or null when the run is over.
router.post('/trivia/streak/next', async (req, res, next) => {
  try {
    const { roundId } = req.body || {}
    const index = Number(req.body?.index)
    if (!roundId || !Number.isInteger(index)) return res.status(400).json({ error: 'roundId and index required' })

    const { data: round } = await supabase
      .from('arcade_rounds')
      .select('id, user_id, game_key, payload, finished_at')
      .eq('id', roundId)
      .maybeSingle()
    if (!round) return res.status(404).json({ error: 'Round not found' })
    if (round.user_id !== req.user.id) return res.status(403).json({ error: 'Not your round' })

    // Served from the queue dealt at start, so the choices are in the order
    // the stored answer index refers to. One question at a time: the client
    // never holds one it has not reached.
    const queue = round.payload?.queue || []
    if (index >= queue.length) return res.json({ question: null })

    // The clock starts when the question leaves the server.
    const servedAt = { ...(round.payload?.servedAt || {}), [index]: Date.now() }
    await supabase.from('arcade_rounds')
      .update({ payload: { ...round.payload, servedAt } })
      .eq('id', round.id)

    res.json({ question: queue[index], seconds: QUESTION_SECONDS })
  } catch (err) {
    next(err)
  }
})

// Check ONE answer, mid-round.
//
// The answer key stays on the server — the start payload never ships it —
// so telling a player they were right requires asking. That round trip is
// what makes immediate feedback possible at all, and it is what streak mode
// is built on: the server has to know the run is over before it can say so.
//
// The choice is recorded in the round payload as it is made, so finish
// scores what was actually answered rather than what the client reports at
// the end, and a question cannot be answered twice.
router.post('/trivia/answer', async (req, res, next) => {
  try {
    const { roundId } = req.body || {}
    const index = Number(req.body?.index)
    const choice = Number(req.body?.choice)
    if (!roundId) return res.status(400).json({ error: 'roundId required' })
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'index required' })

    const { data: round } = await supabase
      .from('arcade_rounds')
      .select('id, user_id, game_key, started_at, finished_at, payload')
      .eq('id', roundId)
      .maybeSingle()

    if (!round) return res.status(404).json({ error: 'Round not found' })
    if (round.user_id !== req.user.id) return res.status(403).json({ error: 'Not your round' })
    if (round.finished_at) return res.status(409).json({ error: 'Round already finished' })

    const answers = round.payload?.answers || []
    if (index >= answers.length) return res.status(400).json({ error: 'No such question in this round' })

    const given = round.payload?.given || []
    if (given[index] != null) return res.status(409).json({ error: 'That question is already answered' })

    // Out of time counts as wrong, judged on the server's own stamp. A
    // round with no stamp is one started before the clock existed, or the
    // fixed mode, which deals every question at once and has no per-question
    // serve time to measure against — those are untimed.
    const servedAt = round.payload?.servedAt?.[index]
    const expired = servedAt != null
      && Date.now() - servedAt > QUESTION_SECONDS * 1000 + QUESTION_GRACE_MS

    const correctIndex = answers[index]
    const wasRight = !expired && choice === correctIndex
    // -1 marks "answered wrongly" for a timeout, so the slot is filled and
    // the question cannot be retried.
    given[index] = expired ? -1 : (Number.isInteger(choice) ? choice : -1)

    await supabase
      .from('arcade_rounds')
      .update({ payload: { ...round.payload, given } })
      .eq('id', round.id)

    res.json({
      wasRight,
      expired,
      correctIndex,
      explanation: round.payload?.explanations?.[index] || null,
      // How far they have got without a miss — streak mode ends on the
      // first false, and the ordinary mode simply ignores it.
      streak: given.reduce((n, g, i) => (g === answers[i] ? n + 1 : n), 0),
    })
  } catch (err) {
    next(err)
  }
})

// End a streak run and record it.
//
// Scored on the questions CLEARED, by difficulty — so surviving deep into
// the hard end is worth more than a long run through easy ones, which is
// the only way the mode rewards what it is actually testing.
//
// No time bonus. A streak ends when you are wrong, not when you are slow,
// and paying for speed would push people to guess fast on a question they
// could have reasoned out.
router.post('/trivia/streak/finish', async (req, res, next) => {
  try {
    const { roundId } = req.body || {}
    if (!roundId) return res.status(400).json({ error: 'roundId required' })

    const { data: round } = await supabase
      .from('arcade_rounds')
      .select('id, user_id, game_key, variant, started_at, finished_at, payload')
      .eq('id', roundId)
      .maybeSingle()
    if (!round) return res.status(404).json({ error: 'Round not found' })
    if (round.user_id !== req.user.id) return res.status(403).json({ error: 'Not your round' })
    if (round.finished_at) return res.status(409).json({ error: 'Round already finished' })

    const answers = round.payload?.answers || []
    const given = round.payload?.given || []
    const difficulties = round.payload?.difficulties || []

    // Correct answers from the start until the first miss. Counted here
    // rather than taken from the client: the run's length IS the score.
    let streak = 0
    for (let i = 0; i < answers.length; i++) {
      if (given[i] == null || given[i] !== answers[i]) break
      streak++
    }
    const score = Array.from({ length: streak }, (_, i) =>
      POINTS_FOR_DIFFICULTY[difficulties[i]] ?? POINTS_PER_CORRECT).reduce((a, b) => a + b, 0)

    const durationMs = Date.now() - new Date(round.started_at).getTime()
    await supabase.from('arcade_rounds').update({ finished_at: new Date().toISOString() }).eq('id', round.id)

    const { error: saveErr } = await supabase.from('arcade_scores').insert({
      user_id: req.user.id,
      round_id: round.id,
      game_key: TRIVIA_STREAK,
      variant: round.variant,
      score,
      // `pairs` is the generic "size of the round" column; here it is the
      // run itself, which is what the board's sub-line shows.
      pairs: streak,
      moves: streak,
      duration_ms: durationMs,
    })
    if (saveErr) throw saveErr

    // Per-question stats on the authored pool, same read-then-write the
    // fixed mode uses — PostgREST can't express `col = col + 1` without a
    // database function, and a lost count under concurrency is fine for a
    // curation hint. Only questions actually REACHED are counted: a streak
    // deals 40 and most runs never see half of them, so counting the whole
    // queue as "served" would make every question look unanswerable.
    const ids = round.payload?.questionIds || []
    const reached = ids.map((id, i) => (id && given[i] != null ? id : null)).filter(Boolean)
    if (reached.length) {
      const { data: current } = await supabase
        .from('trivia_questions')
        .select('id, times_served, times_correct')
        .in('id', reached)
      const byId = Object.fromEntries((current || []).map((r) => [r.id, r]))
      for (let i = 0; i < ids.length; i++) {
        const row = ids[i] && given[i] != null && byId[ids[i]]
        if (!row) continue
        await supabase
          .from('trivia_questions')
          .update({
            times_served: (row.times_served || 0) + 1,
            times_correct: (row.times_correct || 0) + (given[i] === answers[i] ? 1 : 0),
          })
          .eq('id', row.id)
      }
    }

    res.json({ streak, score, durationMs, total: answers.length })
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
    // Prefer what the server recorded as each answer was given. The client's
    // array is a fallback for rounds played before per-answer checking, and
    // it is the thing a tampered request would lie about.
    const given = round.payload?.given || []
    const chosenAt = (i) => (given[i] != null ? given[i] : (Number.isInteger(answers[i]) ? answers[i] : null))
    const results = correctAnswers.map((correct, i) => ({
      correct,
      chosen: chosenAt(i),
      wasRight: chosenAt(i) === correct,
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

// High scores for one game: the top 20 ROUNDS, arcade-cabinet style.
//
// Not the top 20 PLAYERS. The same person can hold several slots, because
// that is what a high-score table is — a record of the best games anyone has
// played, not a ranking of who is best on average. It also sidesteps the
// question that made cumulative scoring awkward: with no aggregation there
// is nothing to decide about how rounds of different lengths or difficulties
// combine. One round, one score, one row.
router.get('/leaderboard', async (req, res, next) => {
  try {
    const gameKey = String(req.query.game || MEMORY)
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100)

    // OMITTING `variant` means every round of this game, whatever sport it
    // drew from. Naming one filters to it.
    //
    // Note 'all' is a real stored variant, not a wildcard — it is what a
    // round played on the All Sports pool records. So "every round" has to
    // be the ABSENCE of the parameter; passing variant=all would return
    // only the mixed-pool rounds and quietly hide every NBA score.
    const variant = req.query.variant ? String(req.query.variant) : null

    let query = supabase
      .from('arcade_scores')
      .select('id, user_id, score, pairs, moves, informed_misses, duration_ms, created_at, users(username, display_name, avatar_url, avatar_emoji)')
      .eq('game_key', gameKey)
    if (variant) query = query.eq('variant', variant)

    const { data: rows, error } = await query
      // A streak board ranks the RUN: 15 in a row beats 14, whatever
      // difficulties each happened to draw. Points break the tie.
      .order(gameKey === TRIVIA_STREAK ? 'pairs' : 'score', { ascending: false })
      .order('score', { ascending: false })
      .order('duration_ms', { ascending: true })
      .limit(500)
    if (error) throw error

    // Every round stands on its own — no per-user dedupe.
    const board = (rows || []).slice(0, limit).map((r, i) => ({
      rank: i + 1,
      // The SCORE row's id, not the user's. One player can hold several
      // slots now that the per-user dedupe is gone, so user_id is not a
      // unique identifier for a row and never was a safe React key.
      id: r.id,
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

    // The caller's best entry ON this board, so the UI can highlight where
    // they sit when they hold more than one slot.
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
    // Trivia's readiness and its SPORTS ride along on this request rather
    // than getting their own endpoint: the arcade room fetches this once to
    // build its tiles, and a sport with four questions in it is a category
    // that deals the same four every time.
    const { data: triviaRows } = await supabase
      .from('trivia_questions')
      .select('sport')
      .eq('status', 'published')

    const bySport = {}
    for (const r of triviaRows || []) bySport[r.sport] = (bySport[r.sport] || 0) + 1
    // A sport is offered only if it can fill the longest round on its own.
    // Questions tagged 'all' count toward every sport, which is what
    // buildRound does when it deals.
    const universal = bySport.all || 0
    const triviaSports = Object.entries(bySport)
      .filter(([key, n]) => key !== 'all' && n + universal >= TRIVIA_MIN_FOR_SPORT)
      .map(([key, n]) => ({ key, count: n + universal }))
      .sort((a, b) => b.count - a.count)

    res.json({
      variants,
      pairCounts: PAIR_COUNTS,
      trivia: { published: (triviaRows || []).length, sports: triviaSports },
    })
  } catch (err) {
    next(err)
  }
})

export default router
