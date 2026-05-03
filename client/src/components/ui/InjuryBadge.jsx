const INJURY_COLORS = {
  Out: 'bg-incorrect text-white',
  IR: 'bg-incorrect text-white',
  Questionable: 'bg-yellow-500 text-black',
  Doubtful: 'bg-yellow-500 text-black',
  Probable: 'bg-correct text-white',
  'Day-To-Day': 'bg-yellow-500 text-black',
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
      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'} ${className}`}
      title={status}
    >
      {shortLabel(status)}
    </span>
  )
}
