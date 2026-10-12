import { useState, useMemo } from 'react'
import MemoryGame from './MemoryGame'
import TriviaGame from './TriviaGame'
import TriviaStreak from './TriviaStreak'
import ArcadeLeaderboard from './ArcadeLeaderboard'
import ArcadeBack from './ArcadeBack'
import { getBackdropUrl } from '../../lib/backdropUrl'
import { useMemoryVariants } from '../../hooks/useArcade'

/**
 * The arcade, as a room rather than a feed tab.
 *
 * It was a tab on the Feed row, which put "play a memory game" next to "my
 * squad's posts" as if they were two views of the same thing. They aren't —
 * the feed is something you read, the arcade is somewhere you go. So entering
 * clears the feed and the news rail and gives the arcade the whole page.
 *
 * Games are a GRID of activity tiles, each carrying a real visual. There are
 * two today and the grid looks thin at two, but the alternative — stacking
 * two full-width panels — reads as a settings page, and a grid is the shape
 * this grows into. A third tile costs one entry in GAMES.
 */

/**
 * The arcade's mark — Nick's cabinet art.
 *
 * Keyed off its flat background and trimmed to the cabinet, so it carries no
 * dark box and sits on any surface. Shipped at 256px: the largest place it
 * renders is the room header at ~40px, which leaves plenty of density, and
 * the screen's gradient dithers visibly if the palette is reduced further.
 *
 * Square canvas with the cabinet centred, so `w-N h-N` sizes it correctly
 * without distorting a subject that is much taller than it is wide.
 *
 * It brings its own colour rather than inheriting currentColor — worth
 * knowing before placing it anywhere that isn't accent-orange or neutral.
 */
export function ArcadeIcon({ className = 'w-5 h-5' }) {
  return <img src="/arcade-icon.png" alt="" aria-hidden="true" draggable={false} className={`${className} object-contain`} />
}

/**
 * Tile art for Memory: a board mid-game.
 *
 * Four backdrops laid flat said "we have pictures". This says what the game
 * IS — one matched pair face up, the rest face down with the same question
 * mark the real board uses. The pair is the same image twice, because that
 * is what a match looks like, and the eye reads it before the caption does.
 */
function MemoryArt({ samples }) {
  const face = (samples || [])[0]
  if (!face) {
    return <div className="absolute inset-0 bg-gradient-to-br from-accent/30 to-bg-primary" />
  }
  // Positions of the matched pair in a 3x2 board. Diagonal on purpose —
  // adjacent cards would read as one wide photo rather than two cards.
  const MATCHED = [0, 4]
  return (
    <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-1 p-1">
      {[0, 1, 2, 3, 4, 5].map((i) =>
        MATCHED.includes(i) ? (
          <img key={i} src={getBackdropUrl(face)} alt="" draggable={false}
            className="h-full w-full rounded object-cover ring-1 ring-accent/70" />
        ) : (
          <span key={i}
            className="flex h-full w-full items-center justify-center rounded bg-bg-primary/80 font-display text-base text-text-muted">
            ?
          </span>
        ),
      )}
    </div>
  )
}

/**
 * Tile art for Trivia: four answer rows with one lit. There is no image
 * library for trivia the way there is for Memory, and a stock question-mark
 * says "help" more than it says "quiz" — so the art is the thing the player
 * actually does, which is pick one of four.
 */
function TriviaArt() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-2 px-4 sm:px-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`h-2.5 sm:h-3 rounded-full ${
          i === 2 ? 'bg-accent' : 'bg-text-primary/15'
        }`} style={{ width: `${[78, 62, 88, 54][i]}%` }} />
      ))}
    </div>
  )
}

/**
 * Tile art for Streak: a run of cleared rungs and the one that ends it.
 *
 * The same four-bar shape as Trivia, because it is the same game underneath
 * — but read as a run rather than a question, which is the difference the
 * mode actually makes.
 */
function StreakArt() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-2 px-4 sm:px-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`h-2.5 sm:h-3 rounded-full ${
          i < 3 ? 'bg-correct/70' : 'bg-incorrect/70'
        }`} style={{ width: `${[64, 78, 58, 86][i]}%` }} />
      ))}
    </div>
  )
}

const GAMES = [
  {
    key: 'memory',
    name: 'Memory',
    blurb: 'Match the pairs of sports images.',
    detail: 'Only misses on cards you had already seen cost points.',
    art: MemoryArt,
  },
  {
    key: 'trivia',
    name: 'Trivia',
    blurb: 'Sports history, easiest first.',
    detail: 'Harder questions are worth more. Answer fast for the time bonus.',
    art: TriviaArt,
  },
  {
    key: 'streak',
    name: 'Streak',
    blurb: 'Answer until you miss one.',
    detail: 'They get harder the longer you last.',
    art: StreakArt,
  },
]

// One board per game. No aggregate: a high-score table is a record of the
// best rounds anyone has played, and summing across games only raised the
// question of how rounds of different lengths and difficulties combine.
const BOARDS = [
  { key: 'memory', label: 'Memory' },
  { key: 'trivia', label: 'Trivia' },
  // Its own table: a streak score and a 20-question score are different
  // units, so one board would rank the mode rather than the player.
  { key: 'trivia_streak', label: 'Streak' },
]

export default function ArcadeRoom({ onExit }) {
  const [playing, setPlaying] = useState(null)   // null | 'memory' | 'trivia'
  const [board, setBoard] = useState('memory')
  const { data: variantData, isLoading } = useMemoryVariants()

  // Every round draws from the whole library. There was a per-sport set
  // picker; choosing one is a decision nobody asked to make before playing a
  // memory game, and it fragmented the leaderboard into a board per set.
  // One deck, one board, and the deal is random every time.
  const allSet = useMemo(
    () => (variantData?.variants || []).find((v) => v.key === 'all') || null,
    [variantData],
  )

  if (playing === 'memory') {
    return (
      <div className="sm:rounded-2xl sm:border sm:border-text-primary/20 sm:bg-bg-primary/40 sm:p-4 min-w-0">
        <MemoryGame
          variant="all"
          variantCount={allSet?.count}
          onExit={() => setPlaying(null)}
        />
      </div>
    )
  }

  if (playing === 'streak') {
    return (
      <div className="sm:rounded-2xl sm:border sm:border-text-primary/20 sm:bg-bg-primary/40 sm:p-4 min-w-0">
        <TriviaStreak variant="all" onExit={() => setPlaying(null)} />
      </div>
    )
  }

  if (playing === 'trivia') {
    return (
      <div className="sm:rounded-2xl sm:border sm:border-text-primary/20 sm:bg-bg-primary/40 sm:p-4 min-w-0">
        {/* Trivia draws from every sport. A round for 'all' pulls from the
            whole published pool, which is what the one variant we have
            means — a per-sport trivia picker waits until there are enough
            published questions per sport to fill a round from one. */}
        <TriviaGame variant="all" onExit={() => setPlaying(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex items-center gap-2 sm:gap-3">
        <ArcadeBack onClick={onExit} label="Hub" />
        {/* No mark here. You tapped the cabinet to arrive and the heading
            says Arcade — a miniature of it is the third time in a row. */}
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl text-text-primary leading-none">Arcade</h2>
          <p className="hidden sm:block text-xs text-text-muted mt-1">
            Scores here are their own board — they don't move your IKB points or tier.
          </p>
        </div>
      </div>

      {/* Stacked on a phone, two across on desktop. With two games a tighter
          grid only shrinks the art — and the memory tile is a six-cell board
          now, which needs the width to be legible at all. Worth revisiting
          as a wall once there are more than three or four. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {GAMES.map((g) => {
          const Art = g.art
          // A round needs questions. Rather than let the tile launch into
          // "not enough questions available yet", it says so and doesn't
          // pretend to be playable.
          const notReady = (g.key === 'trivia' || g.key === 'streak') && !isLoading && (variantData?.trivia?.published || 0) < 2
          return (
            <div key={g.key} className="rounded-2xl border border-text-primary/20 bg-bg-primary/40 overflow-hidden min-w-0">
              {/* The art is the button. A tile you can tap anywhere reads as
                  an activity; a tile with a small Play link reads as a list
                  item that happens to have a picture. */}
              <button
                disabled={notReady}
                onClick={() => setPlaying(g.key)}
                className={`relative block w-full h-44 sm:h-48 lg:h-56 overflow-hidden bg-bg-secondary group ${notReady ? 'cursor-default' : ''}`}
              >
                <Art samples={allSet?.samples} />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 p-2 sm:p-3">
                  <span className="font-display text-lg sm:text-2xl text-text-primary leading-tight truncate">{g.name}</span>
                  {notReady ? (
                    <span className="rounded-lg border border-text-primary/20 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-text-muted shrink-0">
                      Soon
                    </span>
                  ) : (
                    <span className="rounded-lg bg-accent px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-white shrink-0 group-hover:brightness-110">
                      Play
                    </span>
                  )}
                </div>
              </button>

              <div className="p-2.5 sm:p-3 space-y-2 min-w-0">
                <p className="text-[11px] sm:text-xs text-text-secondary">{g.blurb}</p>
                {/* The second line is detail, not identity — it's the first
                    thing to go when the tile is half a phone wide. */}
                <p className="hidden xl:block text-[11px] text-text-muted">
                  {notReady ? 'Written, waiting on review.' : g.detail}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* One board with tabs, not a board per game bolted on as games are
          added. Overall leads because it's the arcade's own answer to "who
          is winning"; the per-game tabs are where you go to see why. */}
      <div className="rounded-2xl border border-text-primary/20 bg-bg-primary/40 overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b border-text-primary/10 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1">
            {BOARDS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBoard(b.key)}
                className={`rounded-lg border bg-bg-primary/50 backdrop-blur-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
                  board === b.key
                    ? 'border-accent text-accent'
                    : 'border-text-primary/20 text-text-primary hover:border-text-primary/40'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-text-muted truncate">top 20 scores</span>
        </div>
        <div className="px-4">
          <ArcadeLeaderboard game={board} variant="all" />
        </div>
      </div>
    </div>
  )
}
