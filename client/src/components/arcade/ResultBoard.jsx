import ArcadeLeaderboard from './ArcadeLeaderboard'

/**
 * The high scores, shown under a result.
 *
 * A score on its own is a number. The only question anyone has after a round
 * is where it landed, and making them back out to the arcade to find out
 * puts two taps between the answer and the question.
 *
 * Each game renders this itself rather than being handed it, because each
 * one knows its own board key — and streak reaches the screen through
 * TriviaGame, so passing it down would mean threading a prop through a
 * component that isn't using it.
 *
 * The finish mutations already invalidate the leaderboard query, so the
 * round that just ended is in the table by the time this paints.
 */
export default function ResultBoard({ game, variant = 'all' }) {
  return (
    <div className="mt-6 border-t border-text-primary/10 pt-4 text-left">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-text-muted">High scores</div>
      <ArcadeLeaderboard game={game} variant={variant} />
    </div>
  )
}
