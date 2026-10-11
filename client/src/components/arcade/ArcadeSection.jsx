import { useState, useMemo } from 'react'
import MemoryGame from './MemoryGame'
import TriviaGame from './TriviaGame'
import Avatar from '../ui/Avatar'
import { useMemoryVariants, useArcadeLeaderboard } from '../../hooks/useArcade'

/**
 * Arcade home: pick a game, pick a set, see the board.
 *
 * Arcade scores are deliberately separate from IKB points — total_points,
 * tiers and the record book are earned on predictions, and a memory game must
 * not move anyone up a tier. Each game keeps its own board, per set.
 */

// Display names for the variant keys stored on league_backdrops.formats.
// Unlisted keys fall back to a tidied version of the key itself, so a new
// backdrop set shows up here without a code change.
const VARIANT_LABELS = {
  all: 'All Sports',
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_wnba: 'WNBA',
  americanfootball_ncaaf: 'NCAAF',
  basketball_ncaab: 'NCAAB',
  td_pass_competition: 'TD Pass Legends',
  touchdown_survivor: 'Touchdown Legends',
  receptions_contest: 'Receiving Legends',
  ints_contest: 'Interception Legends',
  sacks_contest: 'Sack Legends',
  tackles_contest: 'Tackle Legends',
  hr_derby_contest: 'Home Run Legends',
  strikeouts_contest: 'Strikeout Legends',
  three_point_contest: '3-Point Legends',
  wnba_three_point_contest: 'WNBA 3-Point Legends',
  wnba_dfs_contest: 'WNBA Legends',
}

function labelFor(key) {
  return VARIANT_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDuration(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Leaderboard({ variant }) {
  const { data, isLoading } = useArcadeLeaderboard('memory', variant)
  const board = data?.board || []

  if (isLoading) return <p className="text-sm text-text-muted py-6 text-center">Loading board…</p>
  if (!board.length) {
    return (
      <p className="text-sm text-text-muted py-6 text-center">
        No scores yet for {labelFor(variant)}. Be first.
      </p>
    )
  }

  return (
    <div className="divide-y divide-text-primary/10">
      {board.map((row) => (
        <div
          key={row.user_id}
          className={`flex items-center gap-3 py-2.5 ${data?.me?.user_id === row.user_id ? 'bg-accent/5' : ''}`}
        >
          <span className="w-6 text-center font-mono text-sm text-text-muted">{row.rank}</span>
          <Avatar
            user={{
              display_name: row.display_name,
              username: row.username,
              avatar_url: row.avatar_url,
              avatar_emoji: row.avatar_emoji,
            }}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-primary">
              {row.display_name || row.username}
            </div>
            {/* How the score was earned, not just the number — a 740 from 10
                pairs is a different achievement than a 740 from 6. */}
            <div className="text-[11px] text-text-muted">
              {row.pairs} pairs · {row.moves} moves · {formatDuration(row.duration_ms)}
              {row.informed_misses ? ` · ${row.informed_misses} missed` : ''}
            </div>
          </div>
          <span className="font-display text-lg tabular-nums text-accent">{row.score}</span>
        </div>
      ))}
    </div>
  )
}

export default function ArcadeSection() {
  // null when browsing; 'memory' | 'trivia' while a game is open.
  const [playing, setPlaying] = useState(null)
  const [game, setGame] = useState('memory')
  const [variant, setVariant] = useState('all')
  const { data: variantData, isLoading } = useMemoryVariants()

  const variants = useMemo(() => variantData?.variants || [], [variantData])

  if (playing === 'memory') {
    return (
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary/40 p-4 min-w-0">
        <MemoryGame
          variant={variant}
          variantLabel={labelFor(variant)}
          variantCount={variants.find((v) => v.key === variant)?.count}
          onExit={() => setPlaying(null)}
        />
      </div>
    )
  }

  if (playing === 'trivia') {
    return (
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary/40 p-4 min-w-0">
        <TriviaGame
          variant={triviaVariant}
          variantLabel={labelFor(triviaVariant)}
          onExit={() => setPlaying(null)}
        />
      </div>
    )
  }

  return (
    // min-w-0 at every level down to the scroller, so the image-set row —
    // wider than the column by design — scrolls inside its own box.
    //
    // Necessary but NOT sufficient: Hub renders this inside a grid, and a
    // `1fr` track is `minmax(auto, 1fr)`, whose minimum is its content's
    // max-content width. No amount of min-w-0 on descendants constrains the
    // TRACK. HubPage carries the other half of the fix (minmax(0,1fr) plus
    // min-w-0 on the grid item); without it this section still ran off the
    // right edge on desktop with every one of these classes in place.
    <div className="space-y-4 min-w-0">
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary/40 overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="font-display text-lg text-text-primary">Memory</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Match the pairs. Only misses on cards you had already seen cost points.
          </p>
        </div>

        <div className="p-4 space-y-3 min-w-0">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1.5">Image set</div>
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
          </div>

          <button
            onClick={() => { setGame('memory'); setPlaying('memory') }}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white"
          >
            Play {labelFor(variant)}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-text-primary/20 bg-bg-primary/40 overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b border-text-primary/10 flex items-baseline justify-between">
          <h3 className="font-display text-base text-text-primary">Leaderboard</h3>
          <span className="text-[11px] text-text-muted">{labelFor(variant)} · best round</span>
        </div>
        <div className="px-4">
          <Leaderboard variant={variant} />
        </div>
      </div>
    </div>
  )
}
