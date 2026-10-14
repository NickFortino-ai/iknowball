import Avatar from '../ui/Avatar'
import { useArcadeLeaderboard } from '../../hooks/useArcade'

function formatDuration(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}


/**
 * The one-line description under a name, in the game's own terms.
 *
 * `pairs` is "how big was the round" and `moves` is "how well did it go" for
 * every game — generic columns that mean something different each time.
 */
function subLine(game, row) {
  const time = formatDuration(row.duration_ms)
  if (game === 'trivia_streak') {
    // Points are gone from the streak screens entirely — the streak is what
    // the board ranks and what players compete on, and a second number
    // measuring something nobody chases only invited the question of which
    // one mattered. The headline is the run; this spells it out in words.
    return row.pairs === 1 ? '1 in a row' : `${row.pairs} in a row`
  }
  if (game === 'trivia') {
    return `${row.moves} of ${row.pairs} correct · ${time}`
  }
  // Memory. The miss count only appears when there was one.
  return `${row.pairs} pairs · ${row.moves} moves · ${time}`
    + (row.informed_misses ? ` · ${row.informed_misses} missed` : '')
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
export default function ArcadeLeaderboard({ game = 'memory', variant = null }) {
  const { data, isLoading } = useArcadeLeaderboard(game, variant)
  const board = data?.board || []

  if (isLoading) return <p className="text-sm text-text-muted py-6 text-center">Loading board…</p>
  if (!board.length) {
    return (
      <p className="text-sm text-text-muted py-6 text-center">
        {variant ? 'No scores for that sport yet. Be first.' : 'No scores yet. Be first.'}
      </p>
    )
  }

  return (
    <div className="divide-y divide-text-primary/10">
      {board.map((row) => (
        <div
          // The score row's id. Keying on user_id broke the moment the
          // per-user dedupe went: one player holds seven of the eight
          // streak slots, so React saw seven rows claiming the same key and
          // rendered them unpredictably.
          key={row.id}
          // Highlights the caller's BEST row, not every row they own —
          // otherwise someone holding most of the board lights up all of it.
          className={`flex items-center gap-3 py-2.5 ${data?.me?.id === row.id ? 'bg-accent/5' : ''}`}
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
                pairs is a different achievement than a 740 from 6.

                Worded per GAME. arcade_scores stores a round's size in
                `pairs` and its quality in `moves` whatever the game is, so
                reading them literally described a trivia round as "10 pairs
                · 5 moves". The columns are generic; the sentence must not
                be. */}
            {row.pairs != null && (
              <div className="text-[11px] text-text-muted">{subLine(game, row)}</div>
            )}
          </div>
          {/* What the board is ABOUT. On a streak board that is the run:
              showing 150 next to "15 in a row" invites the question of why
              the two numbers disagree, when one is just the other scored. */}
          <span className="font-display text-lg tabular-nums text-accent">
            {game === 'trivia_streak' ? row.pairs : row.score}
          </span>
        </div>
      ))}
    </div>
  )
}
