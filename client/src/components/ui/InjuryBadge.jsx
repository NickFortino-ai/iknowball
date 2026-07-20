// Injury indicator — colored letter only, no pill background. The
// color carries the meaning, the letter carries the specifics.
//   Q   bright yellow   Questionable
//   D   red             Doubtful (unlikely to play — treated like Out)
//   DTD bright yellow   Day-To-Day
//   O   red             Out
//   IR  red             Injured Reserve
//   P   green           Probable
const INJURY_COLORS = {
  Out: 'text-incorrect',
  IR: 'text-incorrect',
  Questionable: 'text-yellow-400',
  Doubtful: 'text-incorrect',
  Probable: 'text-correct',
  'Day-To-Day': 'text-yellow-400',
}

function shortLabel(status) {
  if (status === 'Day-To-Day') return 'DTD'
  if (status === 'Questionable') return 'Q'
  if (status === 'Doubtful') return 'D'
  if (status === 'Probable') return 'P'
  if (status === 'Out') return 'O'
  if (status === 'IR') return 'IR'
  return status?.charAt(0) || ''
}

export default function InjuryBadge({ status, className = '' }) {
  if (!status) return null
  return (
    <span
      className={`text-[12px] font-mono font-bold shrink-0 ${INJURY_COLORS[status] || 'text-text-muted'} ${className}`}
      title={status}
    >
      {shortLabel(status)}
    </span>
  )
}
