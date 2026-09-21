// The small right-hand badge on a single-stat contest row.
//
// Was four byte-identical copies, one per contest (receptions, sacks, ints,
// tackles). This codebase has been bitten twice by exactly that shape — the
// injury badge and the IR rules each drifted into two versions that disagreed
// — so it lives in one place now.
//
// Three states:
//   upcoming  "Sun 1:00 PM"     kickoff in the viewer's timezone
//   live      "Q3 · 17-20"      score so far, the player's team first
//   final     "Final 24-17"     result, the player's team first
//
// Before this it only ever rendered the kickoff time, so a game that finished
// hours ago still advertised when it was going to start.
export default function GameStatusBadge({
  gameStartsAt,
  locked,
  gameStatus,
  teamScore,
  oppScore,
}) {
  const hasScore = teamScore != null && oppScore != null

  if (gameStatus === 'final') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-text-muted shrink-0">
        Final{hasScore && <span className="tabular-nums">{teamScore}-{oppScore}</span>}
      </span>
    )
  }

  if (gameStatus === 'live') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-incorrect shrink-0">
        {/* Live games lead with a dot rather than the word, so the score is
            what the eye lands on. */}
        <span className="w-1.5 h-1.5 rounded-full bg-incorrect animate-pulse" />
        {hasScore ? <span className="tabular-nums">{teamScore}-{oppScore}</span> : 'Live'}
      </span>
    )
  }

  // `locked` is the contest's own lock, which can precede kickoff — keep it
  // below the status checks so a finished game still reads "Final".
  if (locked) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-text-primary/10 text-text-muted border border-text-primary/15 shrink-0">
        Locked
      </span>
    )
  }

  if (gameStartsAt) {
    const t = new Date(gameStartsAt)
    const day = t.toLocaleDateString('en-US', { weekday: 'short' })
    const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider text-accent shrink-0">
        {day} {time}
      </span>
    )
  }

  return null
}
