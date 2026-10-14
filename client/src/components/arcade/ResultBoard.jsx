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
// variant defaults to NULL — no filter, every round on the board.
//
// It used to default to the string 'all', which for trivia is not "no
// filter" but a REAL variant: the All Sports pool. TriviaStreak never passed
// one, so finishing a 12-streak on NFL showed the All Sports board, where
// the best run was 4. The board looked stale; it was answering a different
// question.
export default function ResultBoard({ game, variant = null }) {
  return (
    <div className="mt-6 border-t border-text-primary/10 pt-4 text-left">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-text-muted">High scores</div>
      <ArcadeLeaderboard game={game} variant={variant} />
    </div>
  )
}
