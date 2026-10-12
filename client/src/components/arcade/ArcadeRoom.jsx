import { useState, useMemo } from 'react'
import MemoryGame from './MemoryGame'
import TriviaGame from './TriviaGame'
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
 * mark the real board uses.
 *
 * THE CARDS ARE SQUARE, because the real ones are. Stretching a 3x2 grid
 * across a wide tile made them landscape rectangles, so a photo cropped to
 * fill one looked like it was bleeding past its edges rather than sitting
 * inside a card. Fixing the aspect fixes the bleed: the grid is sized from
 * the available HEIGHT (3:2 for three columns and two rows) and centred,
 * which leaves honest margins instead of distorted cells.
 *
 * Borders are `border`, not `ring`. A ring paints outside the element box,
 * so the top-left card's was clipped by the tile's own rounded corner and
 * only showed on two sides.
 *
 * It sits above the caption strip rather than behind it — the gradient that
 * keeps the title readable was washing out the bottom row, which is the
 * other half of why the cards looked like they had no edges.
 */
function MemoryArt({ samples }) {
  const face = (samples || [])[0]
  if (!face) {
    return <div className="absolute inset-0 bg-gradient-to-br from-accent/30 to-bg-primary" />
  }
  // Positions of the matched pair. Diagonal on purpose — adjacent, two
  // copies of one photo read as a single wide image rather than two cards.
  const MATCHED = [0, 4]
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 pb-12">
      <div className="grid aspect-[3/2] h-full grid-cols-3 grid-rows-2 gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) =>
          MATCHED.includes(i) ? (
            <img key={i} src={getBackdropUrl(face)} alt="" draggable={false}
              className="h-full w-full rounded-md border-2 border-accent object-cover" />
          ) : (
            <span key={i}
              className="flex h-full w-full items-center justify-center rounded-md border border-text-primary/20 bg-bg-primary/60 font-display text-sm text-text-muted">
              ?
            </span>
          ),
        )}
      </div>
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
    <div className="absolute inset-0 flex flex-col justify-center gap-2 px-4 pb-12 sm:px-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`h-2.5 sm:h-3 rounded-full ${
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
    blurb: 'Match the pairs of sports images.',
    detail: 'Only misses on cards you had already seen cost points.',
    art: MemoryArt,
  },
  {
    key: 'trivia',
    name: 'Trivia',
    blurb: 'Sports history, easiest first.',
    detail: '10, 20, or go until you miss one.',
    art: TriviaArt,
  },
]

// One board per game. No aggregate: a high-score table is a record of the
// best rounds anyone has played, and summing across games only raised the
// question of how rounds of different lengths and difficulties combine.
// Sport keys are the app's own; these are what a person calls them.
const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  americanfootball_ncaaf: 'NCAAF',
  basketball_nba: 'NBA',
  basketball_wnba: 'WNBA',
  basketball_ncaab: 'NCAAB',
  baseball_mlb: 'MLB',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
  all: 'All Sports',
}

const BOARDS = [
  { key: 'memory', label: 'Memory' },
  { key: 'trivia', label: 'Trivia' },
  // Streak is a MODE of trivia, not a separate game — but it keeps its own
  // table, because "how far you got" and "how well you did over 20" are
  // different units and one board would rank the mode rather than the player.
  { key: 'trivia_streak', label: 'Streak' },
]

export default function ArcadeRoom({ onExit }) {
  const [playing, setPlaying] = useState(null)   // null | 'memory' | 'trivia'
  const [board, setBoard] = useState('memory')
  // null means "every round", which is the default view. A sport key filters
  // to it. Reset when the board changes, or switching from an NBA trivia
  // board to Streak would silently keep filtering to NBA.
  const [boardSport, setBoardSport] = useState(null)
  const { data: variantData, isLoading } = useMemoryVariants()

  // Every round draws from the whole library. There was a per-sport set
  // picker; choosing one is a decision nobody asked to make before playing a
  // memory game, and it fragmented the leaderboard into a board per set.
  // One deck, one board, and the deal is random every time.
  // Only trivia is played per sport; memory deals from one deck.
  const boardHasSports = board === 'trivia' || board === 'trivia_streak'
  const sportFilters = useMemo(
    () => (variantData?.trivia?.sports || []).map((s) => ({ key: s.key, label: SPORT_LABELS[s.key] || s.key })),
    [variantData],
  )

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
          const notReady = g.key === 'trivia' && !isLoading && (variantData?.trivia?.published || 0) < 2
          return (
            /* The WHOLE card is the button — art, name and copy. A Play pill
               in the corner was a smaller target inside a bigger one that
               already worked, and it made the tile read as a list item that
               happens to have a picture rather than as a thing you press.
               "Soon" stays: that is information about availability, not an
               action, and it is the one case where the card does nothing. */
            <button
              key={g.key}
              disabled={notReady}
              onClick={() => setPlaying(g.key)}
              className={`group block w-full overflow-hidden rounded-2xl border bg-bg-primary/40 text-left min-w-0 transition-colors ${
                notReady
                  ? 'border-text-primary/20 cursor-default'
                  : 'border-text-primary/20 hover:border-accent/60'
              }`}
            >
              <div className="relative h-52 sm:h-52 lg:h-56 overflow-hidden bg-bg-secondary">
                <Art samples={allSet?.samples} />
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg-primary via-bg-primary/70 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 p-2 sm:p-3">
                  <span className="font-display text-xl sm:text-2xl text-text-primary leading-tight truncate">{g.name}</span>
                  {notReady && (
                    <span className="rounded-lg border border-text-primary/20 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-text-muted shrink-0">
                      Soon
                    </span>
                  )}
                </div>
              </div>

              <div className="p-2.5 sm:p-3 space-y-2 min-w-0">
                <p className="text-[11px] sm:text-xs text-text-secondary">{g.blurb}</p>
                {/* The second line is detail, not identity — it's the first
                    thing to go when the tile is half a phone wide. */}
                <p className="hidden xl:block text-[11px] text-text-muted">
                  {notReady ? 'Written, waiting on review.' : g.detail}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* One board with tabs, not a board per game bolted on as games are
          added. The trivia boards take a second row of SPORT filters,
          because "who knows the most about the NBA" is a more interesting
          claim than "who is good at trivia" — and in a sports app it is the
          one people actually want to settle.

          Memory has no sport: it deals from one deck. */}
      <div className="rounded-2xl border border-text-primary/20 bg-bg-primary/40 overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b border-text-primary/10 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1">
            {BOARDS.map((b) => (
              <button
                key={b.key}
                onClick={() => { setBoard(b.key); setBoardSport(null) }}
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

        {/* Sport filter. "All" is the absence of a filter, NOT the stored
            variant 'all' — that one is a real value meaning a round played
            on the mixed pool, so selecting it would hide every NBA score
            rather than show everything. */}
        {boardHasSports && sportFilters.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar border-b border-text-primary/10 px-4 py-2">
            {[{ key: null, label: 'All' }, ...sportFilters].map((f) => (
              <button
                key={f.key || 'any'}
                onClick={() => setBoardSport(f.key)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  boardSport === f.key ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <div className="px-4">
          <ArcadeLeaderboard game={board} variant={boardHasSports ? boardSport : null} />
        </div>
      </div>
    </div>
  )
}
