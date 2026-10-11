import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Trivia question generation.
 *
 * Generated questions are computed when a round is dealt and never stored.
 * A question generated on Sunday can become wrong on Tuesday when a stat
 * correction lands — those corrections are real and routine here — so a
 * stored answer would quietly rot. Deriving the answer from the data as it
 * stands at the moment the question is asked removes that failure mode
 * entirely rather than trying to detect it.
 *
 * Every generator must guarantee ONE unambiguous answer. The shared rule:
 *
 *   - the leader must be STRICTLY ahead of second place (no ties), and
 *   - the three distractors must all have DIFFERENT values from the answer,
 *     so "most" questions can't have two defensible winners.
 *
 * A generator that can't satisfy that returns null and is skipped. A trivia
 * question with two right answers is worse than one fewer question.
 */

const NFL = 'americanfootball_nfl'

// Generated (current-season) questions are OFF. See buildRound for why: they
// are the only thing the data can produce, and this game is meant to be
// historical. Kept because they cost nothing to leave in and are the only
// fallback if a sport has too few written questions to fill a round.
const INCLUDE_GENERATED = false

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Build a multiple-choice question from a ranked list.
 *
 * `ranked` is [{ label, value }] sorted descending. Returns null unless the
 * top value is strictly greater than the runner-up AND three distractors with
 * strictly different values exist — the two conditions that make exactly one
 * answer defensible.
 */
function buildFromRanking({ question, ranked, format, sport, explanationFor }) {
  if (!ranked || ranked.length < 4) return null
  const [best, second] = ranked
  if (!(best.value > second.value)) return null // tie at the top — unanswerable

  const distractors = []
  for (const row of ranked.slice(1)) {
    if (row.value === best.value) continue          // would be equally correct
    if (distractors.some((d) => d.label === row.label)) continue
    distractors.push(row)
    if (distractors.length === 3) break
  }
  if (distractors.length < 3) return null

  const options = shuffle([best, ...distractors])
  return {
    sport,
    question,
    choices: options.map((o) => o.label),
    answerIndex: options.findIndex((o) => o.label === best.label),
    explanation: explanationFor
      ? explanationFor(best)
      : `${best.label} — ${format ? format(best.value) : best.value}.`,
    source: 'generated',
  }
}

/**
 * Current NFL season/week, used to keep questions on games that were played.
 *
 * Taken from the app's own getCurrentNflWeek rather than max(season) in
 * nfl_player_stats. That table contains a SENTINEL season 9999 holding
 * simulation data seeded with real player names, so "the highest season"
 * silently resolves to simulated games — every "this season" question was
 * being computed from a league that never happened. Sorting by a column that
 * contains sentinels is not the same as asking what season it is.
 */
async function nflSeasonWeeks() {
  try {
    const { getCurrentNflWeek } = await import('./tdPassService.js')
    const { season, week, isPreSeason } = await getCurrentNflWeek()
    if (!season || !week) return null
    // Only weeks with results are usable, so the current week is excluded
    // by the callers; in preseason there is nothing to ask about yet.
    if (isPreSeason) return null
    return { season, latestWeek: week }
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not resolve current NFL week for trivia')
    return null
  }
}

/**
 * "Who led Week N in <stat>?" — the core NFL generator.
 *
 * Deliberately excludes the current week: a week still in progress produces a
 * leader that changes under the player's feet, and can be flatly wrong by the
 * time the round is scored.
 */
async function nflWeeklyLeader() {
  const meta = await nflSeasonWeeks()
  if (!meta || meta.latestWeek < 2) return null
  const week = 1 + Math.floor(Math.random() * (meta.latestWeek - 1)) // 1..latest-1

  const STATS = [
    { col: 'rush_yd', label: 'rushing yards', fmt: (v) => `${v} rushing yards` },
    { col: 'rec_yd', label: 'receiving yards', fmt: (v) => `${v} receiving yards` },
    { col: 'pass_yd', label: 'passing yards', fmt: (v) => `${v} passing yards` },
    { col: 'rec', label: 'receptions', fmt: (v) => `${v} catches` },
    { col: 'pass_td', label: 'passing touchdowns', fmt: (v) => `${v} passing TDs` },
  ]
  const stat = pick(STATS)

  const { data: rows } = await supabase
    .from('nfl_player_stats')
    .select(`player_id, ${stat.col}`)
    .eq('season', meta.season)
    .eq('week', week)
    .not(stat.col, 'is', null)
    .gt(stat.col, 0)
    .order(stat.col, { ascending: false })
    .limit(12)
  if (!rows?.length) return null

  const ids = rows.map((r) => r.player_id)
  const { data: players } = await supabase
    .from('nfl_players')
    .select('id, full_name')
    .in('id', ids)
  const nameById = Object.fromEntries((players || []).map((p) => [p.id, p.full_name]))

  const ranked = rows
    .filter((r) => nameById[r.player_id])
    .map((r) => ({ label: nameById[r.player_id], value: Number(r[stat.col]) }))

  return buildFromRanking({
    question: `Who led the NFL in ${stat.label} in Week ${week}?`,
    ranked,
    sport: NFL,
    format: stat.fmt,
    explanationFor: (best) => `${best.label} — ${stat.fmt(best.value)} in Week ${week}.`,
  })
}

/** "Who has the most <stat> this season?" */
async function nflSeasonLeader() {
  const meta = await nflSeasonWeeks()
  if (!meta) return null

  const STATS = [
    { col: 'rush_yd', label: 'rushing yards' },
    { col: 'rec_yd', label: 'receiving yards' },
    { col: 'pass_td', label: 'passing touchdowns' },
    { col: 'rec', label: 'receptions' },
  ]
  const stat = pick(STATS)

  // Paged so the totals are over the whole season, not the first 1000 rows —
  // this table runs to 40k rows and a truncated read would crown the wrong
  // player without erroring.
  const totals = new Map()
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('nfl_player_stats')
      .select(`player_id, ${stat.col}`)
      .eq('season', meta.season)
      .not(stat.col, 'is', null)
      .order('player_id')
      .range(from, from + 999)
    if (error) break
    for (const r of data || []) {
      totals.set(r.player_id, (totals.get(r.player_id) || 0) + Number(r[stat.col] || 0))
    }
    if (!data || data.length < 1000) break
    from += 1000
  }
  if (!totals.size) return null

  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  const { data: players } = await supabase
    .from('nfl_players')
    .select('id, full_name')
    .in('id', top.map(([id]) => id))
  const nameById = Object.fromEntries((players || []).map((p) => [p.id, p.full_name]))

  const ranked = top
    .filter(([id]) => nameById[id])
    .map(([id, v]) => ({ label: nameById[id], value: v }))

  return buildFromRanking({
    question: `Who leads the NFL in ${stat.label} this season?`,
    ranked,
    sport: NFL,
    explanationFor: (best) => `${best.label} — ${best.value} ${stat.label} so far.`,
  })
}

/**
 * "Who beat X on <date>?" — works for any sport with final games.
 *
 * The three distractors are other teams from the same sport, so the question
 * stays plausible rather than offering an NHL side as a wrong answer to an
 * MLB question.
 */
async function gameResult(sportKey) {
  const { data: sport } = await supabase.from('sports').select('id').eq('key', sportKey).maybeSingle()
  if (!sport) return null

  const { data: games } = await supabase
    .from('games')
    .select('home_team, away_team, home_score, away_score, winner, starts_at')
    .eq('sport_id', sport.id)
    .eq('status', 'final')
    .not('winner', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(120)
  if (!games || games.length < 8) return null

  const game = pick(games)
  // Draws have no single winner to ask about.
  if (game.winner !== 'home' && game.winner !== 'away') return null
  const winner = game.winner === 'home' ? game.home_team : game.away_team
  const loser = game.winner === 'home' ? game.away_team : game.home_team

  const others = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))]
    .filter((t) => t !== winner && t !== loser)
  if (others.length < 3) return null

  const distractors = shuffle(others).slice(0, 3)
  const options = shuffle([winner, ...distractors])
  // Formatted in ET: game_date is an ET calendar date while starts_at is UTC,
  // and a late kickoff lands on the next UTC day. Asking about "October 8"
  // when the feed calls it October 7 has broken three other features here.
  const when = new Date(game.starts_at).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'long', day: 'numeric',
  })

  return {
    sport: sportKey,
    question: `Which team beat the ${loser} on ${when}?`,
    choices: options,
    answerIndex: options.indexOf(winner),
    explanation: `${winner} won ${Math.max(game.home_score, game.away_score)}–${Math.min(game.home_score, game.away_score)}.`,
    source: 'generated',
  }
}

const GENERATORS = [
  { key: 'nfl_weekly_leader', sports: [NFL], run: nflWeeklyLeader },
  { key: 'nfl_season_leader', sports: [NFL], run: nflSeasonLeader },
  { key: 'game_result', sports: null, run: null }, // handled below, needs a sport
]

/**
 * Build `count` questions for a sport ('all' draws from everything).
 *
 * Mixes generated questions with published hand-written ones. Generators are
 * tried repeatedly because any single attempt can legitimately return null —
 * a tie at the top, a week with no data — and that is the guard working, not
 * a failure.
 */
export async function buildRound({ sport = 'all', count = 8, includeGenerated = INCLUDE_GENERATED } = {}) {
  const questions = []
  const seen = new Set()

  // AUTHORED FIRST, and by default authored ONLY.
  //
  // The generators below work and are verified, but everything they can
  // produce is necessarily about the CURRENT season — that is the only thing
  // the database contains (2026 in progress, 2025 complete, and nothing
  // before it). Trivia here is meant to be historical, and no amount of
  // querying our own tables will produce a question about a 1985 draft class.
  //
  // So generated questions are off by default and kept as a fallback for a
  // sport with too few written questions to fill a round. Flip
  // INCLUDE_GENERATED, or pass includeGenerated, to mix them back in.
  let q = supabase
    .from('trivia_questions')
    .select('id, sport, question, choices, answer_index, explanation, difficulty')
    .eq('status', 'published')
  if (sport !== 'all') q = q.in('sport', [sport, 'all'])
  const { data: authored } = await q.limit(400)

  for (const a of shuffle(authored || [])) {
    if (questions.length >= count) break
    const choices = Array.isArray(a.choices) ? a.choices : []
    if (choices.length < 2 || a.answer_index >= choices.length) continue
    // Shuffle the presented order so a correct position can't be memorised
    // across rounds — the stored order is fixed, what the player sees is not.
    const correct = choices[a.answer_index]
    const options = shuffle(choices)
    questions.push({
      id: a.id,
      sport: a.sport,
      question: a.question,
      choices: options,
      answerIndex: options.indexOf(correct),
      explanation: a.explanation,
      difficulty: a.difficulty ?? 2,
      source: 'authored',
    })
    seen.add(a.question)
  }

  if (!includeGenerated || questions.length >= count) {
    return orderByDifficulty(questions).slice(0, count)
  }

  const sportsWithGames = sport === 'all'
    ? ['americanfootball_nfl', 'baseball_mlb', 'basketball_nba', 'basketball_wnba', 'icehockey_nhl']
    : [sport]

  let attempts = 0
  while (questions.length < count && attempts < count * 8) {
    attempts++
    try {
      let built = null
      const roll = Math.random()
      if ((sport === 'all' || sport === NFL) && roll < 0.6) {
        built = roll < 0.3 ? await nflWeeklyLeader() : await nflSeasonLeader()
      } else {
        built = await gameResult(pick(sportsWithGames))
      }
      if (built && !seen.has(built.question)) {
        seen.add(built.question)
        questions.push(built)
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Trivia generator failed')
    }
  }

  return orderByDifficulty(questions).slice(0, count)
}

/**
 * A round opens easy and ends hard.
 *
 * Shuffled WITHIN each difficulty so the same ranking doesn't produce the
 * same running order every time, then sorted across them — a ramp, not a
 * random walk, so the last question is the one worth bragging about.
 */
function orderByDifficulty(questions) {
  const byLevel = new Map()
  for (const q of questions) {
    const d = q.difficulty ?? 2
    if (!byLevel.has(d)) byLevel.set(d, [])
    byLevel.get(d).push(q)
  }
  const out = []
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    out.push(...shuffle(byLevel.get(level)))
  }
  return out
}

/** How many published questions exist per sport — the admin needs to know
 *  which sports can actually fill a round before anyone taps Play. */
export async function questionCounts() {
  const { data } = await supabase
    .from('trivia_questions')
    .select('sport, status')
  const counts = {}
  for (const r of data || []) {
    const k = `${r.sport}:${r.status}`
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
}
