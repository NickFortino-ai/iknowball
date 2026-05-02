const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  IR: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Doubtful: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
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
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'} ${className}`}
      title={status}
    >
      {shortLabel(status)}
    </span>
  )
}
