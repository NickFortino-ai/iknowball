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

// The arcade's own mark: a cabinet with a joystick. Inline rather than an
// asset so it inherits currentColor and stays crisp at every size — this
// shows up at 16px in the Hub's entry button and at 40px on a tile.
export function ArcadeIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* cabinet */}
      <rect x="4" y="3" width="16" height="14" rx="2" />
      {/* screen */}
      <rect x="7" y="6" width="10" height="5" rx="1" />
      {/* joystick + two buttons */}
      <path d="M9 14.5v-1" />
      <circle cx="9" cy="13" r="1" />
      <circle cx="13.5" cy="14.5" r=".6" fill="currentColor" />
      <circle cx="15.5" cy="14.5" r=".6" fill="currentColor" />
      {/* legs */}
      <path d="M8 17v4M16 17v4" />
    </svg>
  )
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
    <div className="absolute inset-0 grid grid-cols-2 gap-0.5 p-0.5">
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
    <div className="absolute inset-0 flex flex-col justify-center gap-1.5 px-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`h-3 rounded-full ${
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

export default function ArcadeRoom({ onExit }) {
  const [playing, setPlaying] = useState(null)   // null | 'memory' | 'trivia'
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
      <div className="rounded-2xl border border-text-primary/20 bg-bg-primary/40 p-4 min-w-0">
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
      <div className="rounded-2xl border border-text-primary/20 bg-bg-primary/40 p-4 min-w-0">
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
      <div className="flex items-center gap-3">
        <span className="text-accent"><ArcadeIcon className="w-7 h-7" /></span>
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-text-primary leading-none">Arcade</h2>
          <p className="text-xs text-text-muted mt-1">
            Scores here are their own board — they don't move your IKB points or tier.
          </p>
        </div>
        <button
          onClick={onExit}
          className="ml-auto shrink-0 rounded-lg border border-text-primary/20 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-text-primary/40"
        >
          Back to feed
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
                className={`relative block w-full h-32 sm:h-36 bg-bg-secondary group ${notReady ? 'cursor-default' : ''}`}
              >
                <Art samples={current?.samples} />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                  <span className="font-display text-xl text-text-primary leading-none">{g.name}</span>
                  {notReady ? (
                    <span className="rounded-lg border border-text-primary/20 px-3 py-1.5 text-xs font-semibold text-text-muted shrink-0">
                      Coming soon
                    </span>
                  ) : (
                    <span className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shrink-0 group-hover:brightness-110">
                      {g.hasVariants && isPicking ? 'Close' : 'Play'}
                    </span>
                  )}
                </div>
              </button>

              <div className="p-3 space-y-2 min-w-0">
                <p className="text-xs text-text-secondary">{g.blurb}</p>
                <p className="text-[11px] text-text-muted">
                  {notReady ? 'Questions are written and waiting on review.' : g.detail}
                </p>

                {g.hasVariants && isPicking && (
                  <div className="pt-1 space-y-2 min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-text-muted">Image set</div>
                    {isLoading ? (
                      <p className="text-sm text-text-muted">Loading sets…</p>
                    ) : (
                      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 min-w-0">
                        {variants.map((v) => (
                          <button
                            key={v.key}
                            onClick={() => setVariant(v.key)}
                            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
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
                      className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white"
                    >
                      Play {labelFor(variant)}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl border border-text-primary/20 bg-bg-primary/40 overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b border-text-primary/10 flex items-baseline justify-between gap-2">
          <h3 className="font-display text-base text-text-primary">Memory leaderboard</h3>
          <span className="text-[11px] text-text-muted truncate">{labelFor(variant)} · best round</span>
        </div>
        <div className="px-4">
          <ArcadeLeaderboard game="memory" variant={variant} />
        </div>
      </div>
    </div>
  )
}
