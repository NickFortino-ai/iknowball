// The "My Roster" bar for the four salary-cap views, with the live total
// sitting on the right once anything has started.
//
// It goes here rather than in the Salary Cap card above because this header
// is directly over the points column, so the total lines up with the numbers
// it sums. The cap card is also the wrong place for a different reason: by
// the time scores exist, every slot is filled and it reads "$0 of $60,000" —
// true, but spent. The live number is what the manager is actually there for.
//
// Shown only once there are actual points, not merely once the slate is
// under way — a game can be live for a while before anyone scores, and a
// "0.0" sitting in the header reads as a bad roster rather than an unplayed
// one. The test is `!== 0` rather than `> 0` so a genuinely negative total
// (interceptions, fumbles, missed kicks) still shows; that is a real score,
// just an unflattering one.
export default function MyRosterHeader({ livePoints = 0 }) {
  const hasPoints = Number(livePoints) !== 0
  return (
    <div className="px-4 py-3 border-b border-text-primary/10 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-text-primary">My Roster</h3>
      {hasPoints && (
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            Live
          </span>
          <span className="font-display text-lg text-accent leading-none tabular-nums">
            {(Math.round(livePoints * 10) / 10).toFixed(1)}
          </span>
        </div>
      )}
    </div>
  )
}
