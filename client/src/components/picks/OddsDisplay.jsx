import { formatOdds, calculateRiskPoints, calculateRewardPoints } from '../../lib/scoring'

export default function OddsDisplay({ odds, isSelected, small }) {
  if (!odds) return <span className="text-text-muted text-sm">—</span>

  const risk = calculateRiskPoints(odds)
  const reward = calculateRewardPoints(odds)

  return (
    <div className="text-center">
      <div className={`font-bold ${small ? 'text-sm md:text-base' : 'text-base md:text-lg'} ${isSelected ? 'text-white' : ''}`}>
        <span className={isSelected ? '' : 'text-incorrect'}>-{risk}</span>
        <span className={isSelected ? 'text-white/70' : 'text-text-muted'}> → </span>
        <span className={isSelected ? '' : 'text-correct'}>+{reward}</span>
      </div>
      <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-text-muted'}`}>
        {formatOdds(odds)}
      </div>
    </div>
  )
}
