import { useState, useMemo } from 'react'
import MemoryGame from './MemoryGame'
import TriviaGame from './TriviaGame'
import ArcadeLeaderboard from './ArcadeLeaderboard'
import { getBackdropUrl } from '../../lib/backdropUrl'
import { useMemoryVariants } from '../../hooks/useArcade'
import { labelFor } from './variantLabels'

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
 * Tile art for Memory: four real backdrops from the chosen set, laid out as
 * a 2x2 of face-up cards. It shows the player exactly what they'd be matching.
 */
function MemoryArt({ samples }) {
  const tiles = (samples || []).slice(0, 4)
  if (tiles.length < 4) {
    return <div className="absolute inset-0 bg-gradient-to-br from-accent/30 to-bg-primary" />
  }
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5">
      {tiles.map((f, i) => (
        <img key={i} src={getBackdropUrl(f)} alt="" draggable={false}
          className="w-full h-full object-cover rounded-sm" />
      ))}
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
    <div className="absolute inset-0 flex flex-col justify-center gap-1.5 px-3 sm:px-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`h-2 sm:h-2.5 rounded-full ${
          i === 2 ? 'bg-accent' : 'bg-text-primary/15'
        }`} style={{ width: `${[78, 62, 88, 54][i]}%` }} />
      ))}
    </div>
  )
}

const GAMES = [
  {
    key: 'memory',
    name: 'Memory',
    blurb: 'Match the pairs from IKB\'s backdrop library.',
    detail: 'Only misses on cards you had already seen cost points.',
    art: MemoryArt,
    // Memory is played against a chosen image set, so its tile opens a
    // picker. Trivia has no equivalent choice yet.
    hasVariants: true,
  },
  {
    key: 'trivia',
    name: 'Trivia',
    blurb: 'Eight questions, easiest first.',
    detail: 'Harder questions are worth more. Answer fast for the time bonus.',
    art: TriviaArt,
    hasVariants: false,
  },
]

const BOARDS = [
  { key: 'overall', label: 'Overall' },
  { key: 'memory', label: 'Memory' },
  { key: 'trivia', label: 'Trivia' },
]

export default function ArcadeRoom({ onExit }) {
  const [playing, setPlaying] = useState(null)   // null | 'memory' | 'trivia'
  const [board, setBoard] = useState('overall')
  const [variant, setVariant] = useState('all')
  const [picking, setPicking] = useState(null)   // game key whose set picker is open
  const { data: variantData, isLoading } = useMemoryVariants()

  const variants = useMemo(() => variantData?.variants || [], [variantData])
  const current = useMemo(
    () => variants.find((v) => v.key === variant) || variants[0] || null,
    [variants, variant],
  )

  if (playing === 'memory') {
    return (
      <div className="sm:rounded-2xl sm:border sm:border-text-primary/20 sm:bg-bg-primary/40 sm:p-4 min-w-0">
        <MemoryGame
          variant={variant}
          variantLabel={labelFor(variant)}
          variantCount={current?.count}
          onExit={() => setPlaying(null)}
        />
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
        <TriviaGame variant="all" variantLabel="All Sports" onExit={() => setPlaying(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Back sits top-left at a 44px target: on a phone this is the
            control people reach for, and the far corner is the one the thumb
            can't comfortably reach. Desktop keeps the words. */}
        <button
          onClick={onExit}
          aria-label="Back to feed"
          className="shrink-0 -ml-2 flex items-center gap-1.5 rounded-lg px-2 min-w-[44px] min-h-[44px] justify-center sm:justify-start text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="hidden sm:inline text-xs font-semibold">Feed</span>
        </button>
        <ArcadeIcon className="w-9 h-9 sm:w-10 sm:h-10 shrink-0" />
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl text-text-primary leading-none">Arcade</h2>
          <p className="hidden sm:block text-xs text-text-muted mt-1">
            Scores here are their own board — they don't move your IKB points or tier.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {GAMES.map((g) => {
          const Art = g.art
          const isPicking = picking === g.key
          // A round needs questions. Rather than let the tile launch into
          // "not enough questions available yet", it says so and doesn't
          // pretend to be playable.
          const notReady = g.key === 'trivia' && !isLoading && (variantData?.trivia?.published || 0) < 2
          return (
            <div key={g.key} className="rounded-2xl border border-text-primary/20 bg-bg-primary/40 overflow-hidden min-w-0">
              {/* The art is the button. A tile you can tap anywhere reads as
                  an activity; a tile with a small Play link reads as a list
                  item that happens to have a picture. */}
              <button
                disabled={notReady}
                onClick={() => (g.hasVariants ? setPicking(isPicking ? null : g.key) : setPlaying(g.key))}
                className={`relative block w-full h-24 sm:h-28 lg:h-32 overflow-hidden bg-bg-secondary group ${notReady ? 'cursor-default' : ''}`}
              >
                <Art samples={current?.samples} />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 p-2 sm:p-3">
                  <span className="font-display text-base sm:text-xl text-text-primary leading-none truncate">{g.name}</span>
                  {notReady ? (
                    <span className="rounded-lg border border-text-primary/20 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-text-muted shrink-0">
                      Soon
                    </span>
                  ) : (
                    <span className="rounded-lg bg-accent px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-white shrink-0 group-hover:brightness-110">
                      {g.hasVariants && isPicking ? 'Close' : 'Play'}
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

      {/* The set picker is full width, below the grid — not inside the tile.
          A tile is half a phone wide, which is no room for a scroller of set
          names and a Play button, and the choice belongs to the round you're
          about to start rather than to the tile you tapped. */}
      {picking === 'memory' && (
        <div className="rounded-2xl border border-accent/40 bg-bg-primary/40 p-4 space-y-3 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-text-muted">Image set</div>
            <button onClick={() => setPicking(null)} className="text-[11px] text-text-muted hover:text-text-primary">
              Close
            </button>
          </div>
          {isLoading ? (
            <p className="text-sm text-text-muted">Loading sets…</p>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 min-w-0">
              {variants.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setVariant(v.key)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    variant === v.key
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-text-primary/20 text-text-secondary hover:border-text-primary/40'
                  }`}
                >
                  {labelFor(v.key)}
                  <span className="ml-1.5 text-text-muted font-normal">{v.count}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setPlaying('memory')}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white"
          >
            Play {labelFor(variant)}
          </button>
        </div>
      )}

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
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  board === b.key
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-text-muted truncate">
            {board === 'overall'
              ? 'best round in each game, added up'
              : board === 'memory'
              ? `${labelFor(variant)} · best round`
              : 'best round'}
          </span>
        </div>
        <div className="px-4">
          {/* Memory is scored per image set, so its board follows whichever
              set is selected. The other boards have no variant of their own. */}
          <ArcadeLeaderboard game={board} variant={board === 'memory' ? variant : 'all'} />
        </div>
      </div>
    </div>
  )
}
