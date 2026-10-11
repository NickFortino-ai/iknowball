// The small right-hand badge on a single-stat contest row.
//
// Was four byte-identical copies, one per contest (receptions, sacks, ints,
// tackles). This codebase has been bitten twice by exactly that shape — the
// injury badge and the IR rules each drifted into two versions that disagreed
// — so it lives in one place now.
//
// Three states:
//   upcoming  "Sun 1:00 PM"     kickoff in the viewer's timezone
//   live      "Q3 8:42 17-20"   where the game is, then the score
//   final     "Final 24-17"     result, the player's team first
//
// Before this it only ever rendered the kickoff time, so a game that finished
// hours ago still advertised when it was going to start.
/**
 * "Q2" for a quarter, "OT" past regulation.
 *
 * Period arrives as a string because baseball sends "Top 5th" rather than a
 * number — so anything non-numeric is already display-ready and passes
 * through untouched.
 */
function periodLabel(period) {
  if (!period) return null
  const n = Number(period)
  if (!Number.isFinite(n)) return String(period)
  return n > 4 ? 'OT' : `Q${n}`
}

export default function GameStatusBadge({
  gameStartsAt,
  locked,
  gameStatus,
  teamScore,
  oppScore,
  period,
  clock,
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
    const q = periodLabel(period)
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-incorrect shrink-0">
        {/* Live games lead with a dot rather than the word, so the score is
            what the eye lands on. */}
        <span className="w-1.5 h-1.5 rounded-full bg-incorrect animate-pulse" />
        {/* Where the game is, then what the score is. A score with no clock
            can't tell you whether it's worth watching — 7-7 in the first is
            a different fact from 7-7 in the fourth. Muted so it frames the
            score rather than competing with it. */}
        {q && (
          <span className="text-text-muted tabular-nums normal-case">
            {q}{clock ? ` ${clock}` : ''}
          </span>
        )}
        {hasScore ? <span className="tabular-nums">{teamScore}-{oppScore}</span> : (!q && 'Live')}
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
