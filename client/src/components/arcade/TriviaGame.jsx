import { useState, useEffect, useRef } from 'react'
import { useStartTriviaRound, useFinishTriviaRound, useAnswerTrivia } from '../../hooks/useArcade'
import { toast } from '../ui/Toast'
import ArcadeBack from './ArcadeBack'

/**
 * Arcade trivia.
 *
 * Questions arrive WITHOUT their answers — the server holds those and scores
 * the round, so the answer key is never in the browser.
 *
 * No per-question reveal. Answers are collected and the whole round is marked
 * at the end, which keeps the clock honest (a reveal pause would otherwise be
 * timed as thinking) and lets the review screen show every question at once.
 */
function Timer({ startedAt }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])
  const s = Math.floor((Date.now() - startedAt) / 1000)
  return <span className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
}

// Every screen holds a readable measure. The arcade room is wide because
// tiles and a leaderboard want width; trivia is a question and four answers,
// and at the room's full size a question ran most of a 2000px screen with a
// Start button spanning the lot.
const SCREEN = 'space-y-4 max-w-xl mx-auto'

// Round lengths, mirroring the server's TRIVIA_COUNTS. Offered as equal
// start buttons with none pre-selected — the same reason memory's
// difficulties are: tapping one deals immediately, so highlighting a
// default would describe a confirm step that doesn't exist.
const COUNTS = [10, 20]

export default function TriviaGame({ variant = 'all', onExit }) {
  const [round, setRound] = useState(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  // { chosen, wasRight, correctIndex } while the result of an answer is
  // being shown, null the rest of the time.
  const [feedback, setFeedback] = useState(null)
  const startedAt = useRef(null)

  const startTrivia = useStartTriviaRound()
  const answerTrivia = useAnswerTrivia()
  const finishTrivia = useFinishTriviaRound()

  // Remembered so "Play again" repeats the length you just played rather
  // than silently dropping you back to the default.
  const [count, setCount] = useState(COUNTS[0])

  async function deal(n = count) {
    setCount(n)
    setBusy(true)
    try {
      const data = await startTrivia.mutateAsync({ variant, count: n })
      setRound(data)
      setIndex(0)
      setAnswers([])
      setResult(null)
      startedAt.current = Date.now()
    } catch (err) {
      toast(err.message || 'Could not start a round', 'error')
    } finally {
      setBusy(false)
    }
  }

  // Answering is a server round trip now, because the answer key never ships
  // with the questions. It buys the thing worth having: you find out you
  // were right while the question is still in front of you, instead of
  // eight questions later in a summary.
  async function choose(choiceIndex) {
    if (!round || busy || feedback) return
    const next = [...answers]
    next[index] = choiceIndex
    setAnswers(next)
    setBusy(true)

    let verdict = null
    try {
      verdict = await answerTrivia.mutateAsync({ roundId: round.roundId, index, choice: choiceIndex })
      setFeedback({ chosen: choiceIndex, ...verdict })
    } catch {
      // A failed check must not swallow the round — fall through and let
      // finish score it from what the server recorded.
      setBusy(false)
    }

    // Long enough to register the colour, short enough not to feel like a
    // wait. Longer when they were wrong, since the right answer is only
    // worth showing if there is time to read it.
    if (verdict) await new Promise((r) => setTimeout(r, verdict.wasRight ? 650 : 1400))
    setFeedback(null)

    if (index + 1 < round.questions.length) {
      setIndex(index + 1)
      setBusy(false)
      return
    }

    setBusy(true)
    try {
      const res = await finishTrivia.mutateAsync({ roundId: round.roundId, answers: next })
      setResult(res)
    } catch (err) {
      toast(err.message || 'Could not save your score', 'error')
    } finally {
      setBusy(false)
    }
  }

  // ── Intro ─────────────────────────────────────────────────────────────
  if (!round) {
    return (
      <div className={SCREEN}>
        <div className="flex items-center gap-3">
          <ArcadeBack onClick={onExit} />
          <h3 className="font-display text-lg text-text-primary">Trivia</h3>
        </div>
        <p className="text-sm text-text-secondary">
          Sports history, easiest first. Harder questions are worth more, and
          answering fast adds a bonus — but a right answer always beats a
          quick one.
        </p>
        <div className="flex gap-2">
          {COUNTS.map((n) => (
            <button
              key={n}
              onClick={() => deal(n)}
              disabled={busy}
              className="flex-1 rounded-xl border border-text-primary/20 bg-bg-primary/50 backdrop-blur-sm py-3 text-sm font-semibold text-text-primary transition-colors hover:border-accent hover:bg-accent/10 disabled:opacity-40"
            >
              {busy ? 'Dealing…' : `${n} questions`}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Review ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className={SCREEN}>
        <div className="text-center space-y-1">
          <h3 className="font-display text-2xl text-text-primary">
            {result.isPersonalBest ? 'New personal best' : 'Round complete'}
          </h3>
          <div className="font-display text-5xl text-accent tabular-nums">{result.score}</div>
          <p className="text-sm text-text-secondary">
            {result.correctCount}/{result.total} correct
            {result.breakdown.timeBonus > 0 && ` · +${result.breakdown.timeBonus} for speed`}
          </p>
        </div>

        <div className="divide-y divide-text-primary/10">
          {round.questions.map((q, i) => {
            const r = result.results[i]
            return (
              <div key={i} className="py-3">
                <div className="flex gap-2">
                  <span className={`shrink-0 font-bold ${r?.wasRight ? 'text-correct' : 'text-incorrect'}`}>
                    {r?.wasRight ? '✓' : '✕'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary">{q.question}</p>
                    {!r?.wasRight && (
                      <p className="text-xs text-text-muted mt-1">
                        You said <span className="text-incorrect">{q.choices[r?.chosen] ?? '—'}</span>
                        {' · '}Answer: <span className="text-correct">{q.choices[r?.correct]}</span>
                      </p>
                    )}
                    {r?.explanation && (
                      <p className="text-xs text-text-muted mt-0.5">{r.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 justify-center">
          <button onClick={() => deal(count)} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white">Play again</button>
          <button onClick={onExit} className="rounded-xl border border-text-primary/20 px-5 py-2.5 text-sm font-semibold text-text-secondary">Done</button>
        </div>
      </div>
    )
  }

  // ── Question ──────────────────────────────────────────────────────────
  const q = round.questions[index]
  return (
    <div className={SCREEN}>
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <ArcadeBack onClick={onExit} label="Quit" />
        <div className="flex items-center gap-4">
          <span>{index + 1}/{round.questions.length}</span>
          <Timer startedAt={startedAt.current} />
        </div>
      </div>

      <div className="h-1 rounded-full bg-bg-card overflow-hidden">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${((index) / round.questions.length) * 100}%` }}
        />
      </div>

      <p className="font-display text-xl text-text-primary leading-snug">{q.question}</p>

      <div className="space-y-2 pb-4 sm:pb-0">
        {q.choices.map((choice, i) => {
          // Green on the right answer, red on a wrong one you picked. When
          // you miss, the right answer lights up too — otherwise the only
          // thing the moment teaches is that you were wrong.
          const isChosen = feedback?.chosen === i
          const isAnswer = feedback && feedback.correctIndex === i
          const tone = !feedback ? 'border-text-primary/20 text-text-primary hover:border-accent hover:bg-accent/5'
            : isAnswer ? 'border-correct bg-correct/15 text-text-primary'
            : isChosen ? 'border-incorrect bg-incorrect/15 text-text-primary'
            : 'border-text-primary/10 text-text-muted'
          return (
          <button
            key={i}
            onClick={() => choose(i)}
            disabled={busy}
            className={`w-full rounded-xl border px-4 py-4 sm:py-3 text-left text-sm transition-colors disabled:opacity-100 active:bg-accent/10 ${tone}`}
          >
            {choice}
          </button>
          )
        })}
      </div>
    </div>
  )
}
