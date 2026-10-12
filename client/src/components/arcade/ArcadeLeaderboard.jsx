import Avatar from '../ui/Avatar'
import { useArcadeLeaderboard } from '../../hooks/useArcade'

function formatDuration(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * One game's high scores: the top 20 ROUNDS, not the top 20 players.
 *
 * The same person can hold several slots, which is what a high-score table
 * is — a record of the best games anyone has played rather than a ranking of
 * who is best on average.
 *
 * The sub-line says how a score was earned, and what that means differs per
 * game: pairs and time for memory, nothing for trivia, which has no such
 * fields to show.
 */
export default function ArcadeLeaderboard({ game = 'memory', variant }) {
  const { data, isLoading } = useArcadeLeaderboard(game, variant)
  const board = data?.board || []

  if (isLoading) return <p className="text-sm text-text-muted py-6 text-center">Loading board…</p>
  if (!board.length) {
    return (
      <p className="text-sm text-text-muted py-6 text-center">
        No scores yet. Be first.
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
                pairs is a different achievement than a 740 from 6. Four
                fields wrap to two lines at 375px and the row stops scanning,
                so phones get the two that describe the achievement and
                desktop keeps the full breakdown. */}
            {row.pairs != null && (
              <>
                <div className="sm:hidden text-[11px] text-text-muted">
                  {row.pairs} pairs · {formatDuration(row.duration_ms)}
                </div>
                <div className="hidden sm:block text-[11px] text-text-muted">
                  {row.pairs} pairs · {row.moves} moves · {formatDuration(row.duration_ms)}
                  {row.informed_misses ? ` · ${row.informed_misses} missed` : ''}
                </div>
              </>
            )}
          </div>
          <span className="font-display text-lg tabular-nums text-accent">{row.score}</span>
        </div>
      ))}
    </div>
  )
}
