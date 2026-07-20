// Injury indicator — colored letter only, no pill background. The
// color carries the meaning, the letter carries the specifics.
//   Q   bright yellow   Questionable
//   D   red             Doubtful (unlikely to play — treated like Out)
//   DTD bright yellow   Day-To-Day
//   O   red             Out
//   IR  red             Injured Reserve
//   P   green           Probable
// Case-insensitive lookup so Sleeper / ESPN / manual values all resolve.
// Previously "Doubtful" from any non-canonical casing fell through to gray.
const INJURY_COLORS = {
  out: 'text-incorrect',
  ir: 'text-incorrect',
  pup: 'text-incorrect',
  sus: 'text-incorrect',
  suspended: 'text-incorrect',
  doubtful: 'text-yellow-400',
  questionable: 'text-yellow-400',
  probable: 'text-correct',
  'day-to-day': 'text-yellow-400',
  dtd: 'text-yellow-400',
  na: 'text-text-muted',
}

function shortLabel(status) {
  const s = String(status).toLowerCase()
  if (s === 'day-to-day' || s === 'dtd') return 'DTD'
  if (s === 'questionable') return 'Q'
  if (s === 'doubtful') return 'D'
  if (s === 'probable') return 'P'
  if (s === 'out') return 'O'
  if (s === 'ir') return 'IR'
  if (s === 'pup') return 'PUP'
  if (s === 'sus' || s === 'suspended') return 'SUS'
  return status?.charAt(0)?.toUpperCase() || ''
}

export default function InjuryBadge({ status, className = '' }) {
  if (!status) return null
  const color = INJURY_COLORS[String(status).toLowerCase()] || 'text-text-muted'
  return (
    <span
      className={`text-[12px] font-mono font-bold shrink-0 ${color} ${className}`}
      title={status}
    >
      {shortLabel(status)}
    </span>
  )
}
