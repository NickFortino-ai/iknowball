import { useState, useEffect, useRef, useCallback } from 'react'
import { getBackdropUrl } from '../../lib/backdropUrl'
import { useStartMemoryRound, useFinishMemoryRound } from '../../hooks/useArcade'
import { toast } from '../ui/Toast'
import ArcadeBack from './ArcadeBack'

/**
 * Memory, played on IKB's own backdrop library.
 *
 * GRID: four columns on a phone, six from `sm`. At 375px a fifth column puts
 * cards under ~65px, too small to recognise a backdrop — which defeats the
 * game. Difficulty therefore adds rows, and past 10 pairs it has to come from
 * somewhere other than grid size (a single-sport set, where every image looks
 * alike, is the cheapest real difficulty lever).
 *
 * SCORING: only INFORMED misses cost points — see `isInformedMiss`.
 */

// How long a mismatched pair stays face-up before flipping back.
//
// Scaled by difficulty, because the peek IS the difficulty lever here. Hard's
// 900ms is the right speed — long enough to register two images, short enough
// that you have to commit them rather than study them. Easy and medium get
// more room, since the whole point of those tiers is that the game is helping
// you rather than testing you.
//
// Not a huge spread: much past a second and a mismatch stops feeling like a
// miss and starts feeling like the board is waiting on you.
const PEEK_MS = { easy: 1400, medium: 1150, hard: 900 }
const DEFAULT_PEEK_MS = 1150

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy', pairs: 6 },
  { key: 'medium', label: 'Medium', pairs: 8 },
  { key: 'hard', label: 'Hard', pairs: 10 },
]

function Timer({ startedAt, running }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [running])
  const seconds = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return <span className="tabular-nums">{m}:{String(s).padStart(2, '0')}</span>
}

export default function MemoryGame({ variant = 'all', variantCount, onExit }) {
  const [difficulty, setDifficulty] = useState('medium')
  const [round, setRound] = useState(null)      // { roundId, cards, pairs, parSeconds }
  const [flipped, setFlipped] = useState([])    // card ids currently face-up this turn (0-2)
  const [matched, setMatched] = useState(new Set())
  const [moves, setMoves] = useState(0)
  const [informedMisses, setInformedMisses] = useState(0)
  const [startedAt, setStartedAt] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  // Every card id the player has ever had face-up. This is what makes a miss
  // "informed": flipping a card you have never seen is information gathering,
  // not a mistake, so exploring is free and forgetting is not.
  const seen = useRef(new Set())
  const lockUntil = useRef(0)

  const startRound = useStartMemoryRound()
  const finishRound = useFinishMemoryRound()

  const reset = useCallback(() => {
    setRound(null); setFlipped([]); setMatched(new Set())
    setMoves(0); setInformedMisses(0); setStartedAt(null); setResult(null)
    seen.current = new Set()
  }, [])

  async function deal(diff) {
    setBusy(true)
    try {
      const data = await startRound.mutateAsync({ difficulty: diff, variant })
      seen.current = new Set()
      // Stamp the difficulty onto the round rather than reading the picker's
      // state at flip time: the peek belongs to the round being played, and
      // this stays correct if the picker ever becomes reachable mid-round.
      setRound({ ...data, difficulty: diff })
      setFlipped([]); setMatched(new Set()); setMoves(0); setInformedMisses(0)
      setResult(null)
      setStartedAt(Date.now())
    } catch (err) {
      toast(err.message || 'Could not start a round', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function submit(finalMoves, finalMisses) {
    try {
      const res = await finishRound.mutateAsync({
        roundId: round.roundId, moves: finalMoves, informedMisses: finalMisses,
      })
      setResult(res)
    } catch (err) {
      toast(err.message || 'Could not save your score', 'error')
    }
  }

  function handleFlip(card) {
    if (!round || result) return
    if (Date.now() < lockUntil.current) return          // mid-peek
    if (matched.has(card.id)) return
    if (flipped.includes(card.id)) return
    if (flipped.length >= 2) return

    const next = [...flipped, card.id]
    setFlipped(next)

    if (next.length < 2) {
      // First card of the turn. Mark it seen AFTER the informed check below
      // would have run, which is why that check reads `seen` for the SECOND
      // card only.
      seen.current.add(card.id)
      return
    }

    // Second card — this is the guess.
    const [firstId] = next
    const first = round.cards.find((c) => c.id === firstId)
    const isMatch = first && first.pairKey === card.pairKey

    // The penalty lands only when the card being guessed ON was already
    // revealed earlier. At that moment the player can see the first card and
    // has seen the second before, so they knew it would not match. Two
    // unseen cards is a legitimate gamble and costs nothing.
    const wasSeenBefore = seen.current.has(card.id)
    seen.current.add(card.id)

    const nextMoves = moves + 1
    setMoves(nextMoves)

    if (isMatch) {
      const nextMatched = new Set(matched); nextMatched.add(firstId); nextMatched.add(card.id)
      setMatched(nextMatched)
      setFlipped([])
      if (nextMatched.size === round.cards.length) {
        submit(nextMoves, informedMisses)
      }
      return
    }

    const nextMisses = wasSeenBefore ? informedMisses + 1 : informedMisses
    if (wasSeenBefore) setInformedMisses(nextMisses)

    const peekMs = PEEK_MS[round.difficulty] ?? DEFAULT_PEEK_MS
    lockUntil.current = Date.now() + peekMs
    setTimeout(() => { setFlipped([]) }, peekMs)
  }

  const cols = round && round.cards.length > 16 ? 'grid-cols-4 sm:grid-cols-5' : 'grid-cols-4 sm:grid-cols-4'

  // ── Setup ─────────────────────────────────────────────────────────────
  if (!round) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <ArcadeBack onClick={onExit} />
          <h3 className="font-display text-lg text-text-primary">Memory</h3>
        </div>
        <p className="text-sm text-text-secondary">
          Match every pair. Flipping a card you have not seen before is free —
          you only lose points for missing a pair you had already uncovered.
        </p>
        {/* Three equal START buttons, none pre-selected.
            `difficulty` used to default to medium and highlight it, which
            read as "medium is chosen, now confirm" — but tapping any of the
            three deals immediately, so the highlight was describing a step
            that doesn't exist. It is still tracked, purely so Play again can
            repeat the tier you just played.

            The guard stays in case a deck ever ships with fewer images than
            Hard needs; the library has 220, so today it never fires. */}
        <div className="flex gap-2">
          {DIFFICULTIES.map((d) => {
            const fits = !variantCount || variantCount >= d.pairs
            return (
              <button
                key={d.key}
                onClick={() => { setDifficulty(d.key); deal(d.key) }}
                disabled={busy || !fits}
                title={fits ? undefined : `Only ${variantCount} images available`}
                className="flex-1 rounded-xl border border-text-primary/20 px-3 py-3 text-sm font-semibold text-text-secondary transition-colors hover:border-accent hover:bg-accent/10 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {d.label}
                <span className="block text-[11px] font-normal text-text-muted">
                  {fits ? `${d.pairs} pairs` : 'too few images'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Result ────────────────────────────────────────────────────────────
  if (result) {
    const b = result.breakdown
    return (
      <div className="space-y-4">
        <ArcadeBack onClick={onExit} />
        <h3 className="font-display text-2xl text-text-primary text-center">
          {result.isPersonalBest ? 'New personal best' : 'Round complete'}
        </h3>
        <div className="font-display text-5xl text-accent tabular-nums text-center">{result.score}</div>
        {/* Shown as a breakdown, not a bare number — the scoring rule is the
            game's whole strategy, so hiding it would hide the strategy. */}
        <div className="mx-auto max-w-xs text-sm text-text-secondary space-y-1">
          <div className="flex justify-between"><span>{round.pairs} pairs</span><span className="tabular-nums">+{b.base}</span></div>
          <div className="flex justify-between">
            <span>{informedMisses} informed {informedMisses === 1 ? 'miss' : 'misses'}</span>
            <span className="tabular-nums text-incorrect">{b.penalty ? `−${b.penalty}` : '0'}</span>
          </div>
          <div className="flex justify-between">
            <span>{b.elapsedSeconds}s {b.timeBonus > 0 ? `(under ${b.parSeconds}s par)` : `(par ${b.parSeconds}s)`}</span>
            <span className="tabular-nums text-correct">{b.timeBonus ? `+${b.timeBonus}` : '0'}</span>
          </div>
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={() => deal(difficulty)} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white">Play again</button>
          <button onClick={reset} className="rounded-xl border border-text-primary/20 px-5 py-2.5 text-sm font-semibold text-text-secondary">Change difficulty</button>
        </div>
      </div>
    )
  }

  // ── Board ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <ArcadeBack onClick={reset} label="Quit" />
        <div className="flex items-center gap-4 text-text-secondary">
          <span>{matched.size / 2}/{round.pairs}</span>
          <span className="text-text-muted">{moves} moves</span>
          <Timer startedAt={startedAt} running={!result} />
        </div>
      </div>

      <div className={`grid ${cols} gap-2 -mx-2 sm:mx-0`}>
        {round.cards.map((card) => {
          const isUp = flipped.includes(card.id) || matched.has(card.id)
          const isMatched = matched.has(card.id)
          return (
            <button
              key={card.id}
              onClick={() => handleFlip(card)}
              aria-label={isUp ? card.label : 'Hidden card'}
              className={`relative aspect-square rounded-lg overflow-hidden border transition-all ${
                isMatched
                  ? 'border-correct/60 opacity-60'
                  : isUp
                  ? 'border-accent'
                  : 'border-text-primary/15 bg-bg-card hover:border-text-primary/35'
              }`}
            >
              {isUp ? (
                <img
                  src={getBackdropUrl(card.filename)}
                  alt={card.label}
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-display text-lg text-text-muted">?</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
