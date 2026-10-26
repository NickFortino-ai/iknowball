// The "My Roster" bar for the four salary-cap views, with the live total
// sitting on the right once anything has started.
//
// It goes here rather than in the Salary Cap card above because this header
// is directly over the points column, so the total lines up with the numbers
// it sums. The cap card is also the wrong place for a different reason: by
// the time scores exist, every slot is filled and it reads "$0 of $60,000" —
// true, but spent. The live number is what the manager is actually there for.
//
// Gated on the slate having STARTED, not on the total being non-zero. The
// case to suppress is a lineup set days ahead of kickoff, where a "0.0"
// would read as a bad roster rather than an unplayed one. Once a game is
// actually under way a real 0.0 is honest — someone is playing and has not
// scored yet — and hiding it there would be worse, because the number would
// vanish and reappear as points landed.
//
// Colour follows the convention already used on the slot borders and the
// Live tab rows: accent while in progress, correct once everything is done.
// Orange reads as "still moving", green as "settled" — and because the Live
// tab outlines a final roster in correct, a header that went the other way
// would disagree with the border drawn around the same row.
export default function MyRosterHeader({ livePoints = 0, status }) {
  const started = status === 'live' || status === 'final'
  const isFinal = status === 'final'
  return (
    <div className="px-4 py-3 border-b border-text-primary/10 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-text-primary">My Roster</h3>
      {started && (
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            {isFinal ? 'Final' : 'Live'}
          </span>
          <span
            className={`font-display text-lg leading-none tabular-nums ${
              isFinal ? 'text-correct' : 'text-accent'
            }`}
          >
            {(Math.round(livePoints * 10) / 10).toFixed(1)}
          </span>
        </div>
      )}
    </div>
  )
}
