import { formatOdds, calculateRewardPoints, BASE_RISK_POINTS } from '../../lib/scoring'

export default function OddsDisplay({ odds, isSelected }) {
  if (!odds) return <span className="text-text-muted text-sm">—</span>

  const reward = calculateRewardPoints(odds)
  const isFavorite = odds < 0

  return (
    <div className="text-center">
      <div className={`font-semibold text-sm ${isSelected ? 'text-white' : isFavorite ? 'text-accent' : 'text-correct'}`}>
        {formatOdds(odds)}
      </div>
      <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-text-muted'}`}>
        {isFavorite ? `Risk ${BASE_RISK_POINTS} → Win ${reward}` : `Risk ${BASE_RISK_POINTS} → Win ${reward}`}
      </div>
    </div>
  )
}
