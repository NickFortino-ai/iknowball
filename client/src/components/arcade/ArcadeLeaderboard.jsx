import Avatar from '../ui/Avatar'
import { useArcadeLeaderboard } from '../../hooks/useArcade'
import { labelFor } from './variantLabels'

function formatDuration(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * One game's board, for one variant.
 *
 * `game` is a parameter rather than hardcoded to 'memory': the arcade has two
 * games and will have more, each keeping its own board. The sub-line is
 * memory-shaped today (pairs / moves) and is skipped when a row has no pairs,
 * so a trivia board renders without inventing fields it doesn't have.
 */
export default function ArcadeLeaderboard({ game = 'memory', variant }) {
  const { data, isLoading } = useArcadeLeaderboard(game, variant)
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
            {row.pairs != null && (
              <div className="text-[11px] text-text-muted">
                {row.pairs} pairs · {row.moves} moves · {formatDuration(row.duration_ms)}
                {row.informed_misses ? ` · ${row.informed_misses} missed` : ''}
              </div>
            )}
          </div>
          <span className="font-display text-lg tabular-nums text-accent">{row.score}</span>
        </div>
      ))}
    </div>
  )
}
