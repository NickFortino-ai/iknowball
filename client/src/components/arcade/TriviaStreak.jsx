import { useState, useRef, useEffect } from 'react'
import ArcadeBack from './ArcadeBack'
import ResultBoard from './ResultBoard'
import { toast } from '../ui/Toast'
import {
  useStartTriviaStreak,
  useNextStreakQuestion,
  useAnswerTrivia,
  useFinishTriviaStreak,
} from '../../hooks/useArcade'

/**
 * Trivia streak: answer until you miss one.
 *
 * Questions arrive ONE AT A TIME from the server, which already had to be
 * true — the answer key never ships with a question, so checking an answer
 * is a round trip either way. That is what makes this mode possible at all:
 * the server knows the run is over before the player does.
 *
 * The queue is dealt easiest-first, so the run gets harder the longer it
 * lasts. It should end because the questions beat you, not because the list
 * ran out.
 */
const SCREEN = 'space-y-4 max-w-xl mx-auto'

export default function TriviaStreak({ variant = 'all', autoStart = false, onExit }) {
  const [round, setRound] = useState(null)      // { roundId, total }
  const [question, setQuestion] = useState(null)
  const [index, setIndex] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  // Seconds left on the current question. The server is the authority — it
  // timed the question from when it handed it over — so this is the display
  // of that clock, not the clock itself.
  const [secondsLeft, setSecondsLeft] = useState(null)
  const limit = useRef(20)
  const startedAt = useRef(null)
  // Guards the auto-deal against StrictMode's double-invoke in development,
  // which would otherwise open two rounds and abandon one.
  const dealt = useRef(false)

  const startStreak = useStartTriviaStreak()
  const nextQuestion = useNextStreakQuestion()
  const answerTrivia = useAnswerTrivia()
  const finishStreak = useFinishTriviaStreak()

  // Ticks the visible clock and fires one timeout answer when it runs out.
  // Sending -1 rather than nothing keeps a single code path: the server
  // judges expiry on its own stamp either way.
  useEffect(() => {
    if (!question || feedback || busy) return
    if (secondsLeft == null) return
    if (secondsLeft <= 0) { choose(-1); return }
    const t = setTimeout(() => setSecondsLeft((n) => (n == null ? null : n - 1)), 1000)
    return () => clearTimeout(t)
  }, [question, feedback, busy, secondsLeft])

  // Reached from Trivia's own intro, where the mode was already chosen — so
  // a second intro would ask the same question twice.
  useEffect(() => {
    if (!autoStart || dealt.current || round) return
    dealt.current = true
    deal()
  }, [autoStart, round])

  async function deal() {
    setBusy(true)
    try {
      const data = await startStreak.mutateAsync({ variant })
      setRound({ roundId: data.roundId, total: data.total })
      limit.current = data.seconds || 20
      setQuestion(data.question)
      setSecondsLeft(limit.current)
      setIndex(0)
      setStreak(0)
      setResult(null)
      startedAt.current = Date.now()
    } catch (err) {
      toast(err.message || 'Could not start a streak', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function end(roundId) {
    try {
      setResult(await finishStreak.mutateAsync({ roundId }))
    } catch (err) {
      toast(err.message || 'Could not save your streak', 'error')
    }
  }

  async function choose(choiceIndex) {
    if (!round || busy || feedback) return
    setBusy(true)
    setSecondsLeft(null)
    let verdict
    try {
      verdict = await answerTrivia.mutateAsync({ roundId: round.roundId, index, choice: choiceIndex })
    } catch (err) {
      toast(err.message || 'Could not check that answer', 'error')
      setBusy(false)
      return
    }
    setFeedback({ chosen: choiceIndex, ...verdict })
    if (verdict.wasRight) setStreak((n) => n + 1)

    // A miss gets longer, because the right answer is only worth showing if
    // there is time to read it — and it is the last thing you see this run.
    await new Promise((r) => setTimeout(r, verdict.wasRight ? 700 : 1600))
    setFeedback(null)

    if (!verdict.wasRight) {
      await end(round.roundId)
      setBusy(false)
      return
    }

    const nextIndex = index + 1
    try {
      const { question: q } = await nextQuestion.mutateAsync({ roundId: round.roundId, index: nextIndex })
      if (!q) {
        // Cleared the whole queue — the run ends undefeated.
        await end(round.roundId)
      } else {
        setQuestion(q)
        setIndex(nextIndex)
        setSecondsLeft(limit.current)
      }
    } catch (err) {
      toast(err.message || 'Could not load the next question', 'error')
    } finally {
      setBusy(false)
    }
  }

  // ── Result ────────────────────────────────────────────────────────────
  if (result) {
    const perfect = result.streak === result.total
    return (
      // Wider than SCREEN. That measure exists to stop a question and four
      // answers stretching across a 2000px desktop — this screen is a
      // number, two buttons and a leaderboard, none of which are prose, and
      // at max-w-xl the board was a narrow strip down the middle of an empty
      // page. The back control also sits left rather than centred with
      // everything else.
      <div className="space-y-5 max-w-3xl mx-auto text-center">
        <div className="text-left"><ArcadeBack onClick={onExit} /></div>
        <h3 className="font-display text-2xl sm:text-3xl text-text-primary">
          {perfect ? 'Cleared the board' : result.streak === 0 ? 'No streak' : 'Streak over'}
        </h3>
        <div className="font-display text-6xl sm:text-7xl text-accent tabular-nums">{result.streak}</div>
        {/* The streak IS the score — it is what the board ranks and what the
            big number above already says. Points were a second, quieter
            number measuring something nobody competes on. */}
        <p className="text-sm text-text-secondary">
          {result.streak === 1 ? '1 in a row' : `${result.streak} in a row`}
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={deal} disabled={busy} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Dealing…' : 'Again'}
          </button>
          <button onClick={onExit} className="rounded-xl border border-text-primary/20 px-5 py-2.5 text-sm font-semibold text-text-secondary">Done</button>
        </div>

        <ResultBoard game="trivia_streak" variant={variant} />
      </div>
    )
  }

  // ── Intro ─────────────────────────────────────────────────────────────
  // Only ever reached with autoStart. TriviaGame is the sole caller and a
  // sport tile deals on tap, so there is no second screen to ask again.
  // There used to be a Start screen here for the non-autoStart case; it was
  // unreachable and still carried the fixed-round scoring pitch ("harder
  // questions are worth more") that the trivia intro just dropped — stale
  // copy is no better for being invisible.
  if (!round) {
    return <p className="text-sm text-text-muted text-center py-8">Dealing…</p>
  }

  // ── Question ──────────────────────────────────────────────────────────
  return (
    <div className={SCREEN}>
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <ArcadeBack onClick={onExit} label="Quit" />
        {/* The streak IS the score here, so it is the thing on screen —
            there is no question count to show, because there is no end. */}
        <div className="flex items-center gap-3">
          {secondsLeft != null && (
            // Red in the last five seconds. Before that the number alone is
            // enough — a bar that drains the whole time is pressure applied
            // to someone who is simply reading.
            <span className={`font-display text-xl tabular-nums ${
              secondsLeft <= 5 ? 'text-incorrect' : 'text-text-muted'
            }`}>
              {secondsLeft}
            </span>
          )}
          <span className="font-display text-xl text-accent tabular-nums">{streak}</span>
        </div>
      </div>

      <p className="font-display text-xl text-text-primary leading-snug">{question?.question}</p>

      <div className="space-y-2 pb-4 sm:pb-0">
        {(question?.choices || []).map((choice, i) => {
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

      {feedback && !feedback.wasRight && (
        <p className="text-xs text-text-muted text-center">
          {feedback.expired ? "Out of time. " : ''}{feedback.explanation || ''}
        </p>
      )}
    </div>
  )
}
