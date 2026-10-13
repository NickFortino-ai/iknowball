import { useState } from 'react'
import ArcadeBack from './ArcadeBack'
import TriviaStreak from './TriviaStreak'
import { sportLabel, orderSports, sportBackdrop } from './sports'
import { useMemoryVariants } from '../../hooks/useArcade'

/**
 * Trivia: pick a sport, play a streak.
 *
 * This component used to BE the game — deal N questions, render them one at a
 * time, collect answers, score the round, show a review. All of that moved to
 * TriviaStreak when the 10 and 20 question rounds were removed, and what was
 * left here could no longer be reached: the only entry point handed the screen
 * straight to the streak. Around eighty lines of round state, an answer
 * handler, a timer and a review screen sat behind a condition that was always
 * false. They are gone; git has them.
 *
 * The server's fixed-length routes are deliberately still live. Clients that
 * have not updated past the build offering 10 and 20 question rounds keep
 * calling them.
 */
const SCREEN = 'space-y-4 max-w-xl mx-auto'

export default function TriviaGame({ onExit }) {
  // One piece of state, because "which sport" and "am I playing" stopped
  // being different questions the moment a tile became the start button.
  // null is the picker; a sport key is a streak in progress.
  const [sport, setSport] = useState(null)
  const { data: arcadeMeta } = useMemoryVariants()

  if (sport) {
    return <TriviaStreak variant={sport} autoStart onExit={() => setSport(null)} />
  }

  // 'all' is always offered, even as the only tile. The grid used to hide
  // below two sports, on the grounds that a lone "All Sports" tile beside one
  // sport is a control that does nothing — true when something else started
  // the round, but now hiding it would leave no way to start at all.
  const tiles = (arcadeMeta?.trivia?.sports?.length || 0) > 1
    ? [{ key: 'all' }, ...orderSports(arcadeMeta.trivia.sports)]
    : [{ key: 'all' }]

  return (
    <div className={SCREEN}>
      <div className="flex items-center gap-3">
        <ArcadeBack onClick={onExit} />
        <h3 className="font-display text-lg text-text-primary">Trivia</h3>
      </div>
      <p className="text-sm text-text-secondary">
        Pick a sport and keep answering until you miss one. They start easy and
        get harder the longer you last. Harder questions are worth more, and
        answering fast adds a bonus — but a right answer always beats a quick
        one. 20 seconds a question.
      </p>

      {/* Tapping a tile DEALS. There is no second step and nothing to confirm,
          so the tiles carry no selected state. */}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((s) => {
          const bg = sportBackdrop(s.key)
          return (
            <button
              key={s.key}
              onClick={() => setSport(s.key)}
              className={`relative overflow-hidden rounded-2xl border border-text-primary/20 px-6 py-10 transition-all hover:scale-[1.02] hover:border-accent hover:shadow-lg ${
                bg ? '' : 'bg-bg-primary/50 backdrop-blur-sm'
              }`}
              style={bg ? {
                backgroundImage: `url(${bg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : undefined}
            >
              {/* Scrim, as on the Props tiles — the art is photographic and
                  the label has to stay readable over any of it. */}
              {bg && (
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/75 via-black/45 to-black/25" />
              )}
              {/* font-display text-3xl matches the Props tiles. "College
                  Football" is longer than anything Props carries and wraps to
                  two lines at this size; leading-tight keeps that readable and
                  the grid row stretches, so its neighbour matches height
                  rather than the row going ragged. */}
              <span className={`relative block font-display text-3xl leading-tight ${
                bg ? 'text-white drop-shadow-lg' : 'text-text-primary'
              }`}>
                {sportLabel(s.key)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
