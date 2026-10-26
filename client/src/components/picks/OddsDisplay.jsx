import { formatOdds, calculateRiskPoints, calculateRewardPoints } from '../../lib/scoring'

// `multiplier` scales the displayed stake the same way BottomBar does
// (base x mult, from the rounded base), so a multiplied pick reads the same
// on the card as it does in the summary bar. Without it the card showed the
// single-x numbers for a pick the user had already multiplied — a 3x on -225
// read "-10 → +4" here and "-30 → +12" in the bar.
export default function OddsDisplay({ odds, isSelected, small, multiplier = 1 }) {
  if (!odds) return <span className="text-text-muted text-sm">—</span>

  const mult = multiplier > 1 ? multiplier : 1
  const risk = calculateRiskPoints(odds) * mult
  const reward = calculateRewardPoints(odds) * mult

  return (
    <div className="text-center">
      <div className={`font-bold ${small ? 'text-sm md:text-base' : 'text-base md:text-lg'} ${isSelected ? 'text-white' : ''}`}>
        <span className={isSelected ? '' : 'text-incorrect'}>-{risk}</span>
        <span className={isSelected ? 'text-white/70' : 'text-text-muted'}> → </span>
        <span className={isSelected ? '' : 'text-correct'}>+{reward}</span>
      </div>
      <div className={`text-xs flex items-center justify-center gap-1.5 ${isSelected ? 'text-white/70' : 'text-text-muted'}`}>
        <span>{formatOdds(odds)}</span>
        {mult > 1 && (
          <span className={`font-bold ${isSelected ? 'text-white' : 'text-accent'}`}>{mult}x</span>
        )}
      </div>
    </div>
  )
}
