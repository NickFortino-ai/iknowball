// Shared lineup-confirmation badge used across MLB DFS, HR Derby,
// Strikeouts, and any future contest that surfaces lineup_status.
// Renders as a plain glyph (no background fill) for visual uniformity.
//
//   confirmed    → green ✓
//   not_starting → red NS
//   null / undef → yellow ? (lineup not yet announced)

export default function LineupBadge({ status, className = '' }) {
  if (status === 'confirmed') {
    return (
      <span
        title="Confirmed starter"
        className={`shrink-0 text-correct font-bold text-sm leading-none ${className}`}
      >
        ✓
      </span>
    )
  }
  if (status === 'not_starting') {
    return (
      <span
        title="Not starting"
        className={`shrink-0 text-incorrect font-bold text-[10px] leading-none ${className}`}
      >
        NS
      </span>
    )
  }
  return (
    <span
      title="Lineup pending"
      className={`shrink-0 text-yellow-500 font-bold text-sm leading-none ${className}`}
    >
      ?
    </span>
  )
}
