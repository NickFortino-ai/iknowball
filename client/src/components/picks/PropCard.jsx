import { formatOdds, calculateRiskPoints, calculateRewardPoints } from '../../lib/scoring'

const sideStyles = {
  default: 'bg-bg-card hover:bg-bg-card-hover border-border hover:border-border-hover',
  selected: 'bg-accent/20 border-accent',
  locked: 'bg-bg-card border-border opacity-60 cursor-not-allowed',
  correct: 'bg-correct-muted border-correct',
  incorrect: 'bg-incorrect-muted border-incorrect',
}

function getSideState(prop, pick, side) {
  if (!pick) {
    if (prop.status !== 'published') return 'locked'
    return 'default'
  }
  if (pick.picked_side !== side) {
    if (pick.status === 'settled') return 'default'
    if (pick.status === 'locked') return 'locked'
    return 'default'
  }
  // This side is picked
  if (pick.status === 'settled') {
    return pick.is_correct ? 'correct' : 'incorrect'
  }
  if (pick.status === 'locked') return 'locked'
  return 'selected'
}

function abbreviateTeam(name) {
  const words = name.split(' ')
  if (words.length <= 2) return words[0].slice(0, 3).toUpperCase()
  return words.map((w) => w[0]).join('').toUpperCase()
}

export default function PropCard({ prop, pick, onPick, onUndoPick, isSubmitting, compact }) {
  const isLocked = prop.status !== 'published'
  const isSettled = prop.status === 'settled'

  function handleClick(side) {
    if (isLocked || isSubmitting) return
    if (pick?.picked_side === side && pick?.status === 'pending') {
      onUndoPick?.(prop.id)
    } else {
      onPick?.(prop.id, side)
    }
  }

  const overState = getSideState(prop, pick, 'over')
  const underState = getSideState(prop, pick, 'under')

  return (
    <div className={`bg-bg-card rounded-2xl border ${pick?.status === 'locked' ? 'border-accent' : 'border-border'} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-semibold text-sm text-text-primary whitespace-nowrap">{prop.player_name}</span>
          <span className="font-semibold text-sm text-text-primary whitespace-nowrap">{prop.line}</span>
          <span className="font-semibold text-sm text-text-primary truncate">{prop.market_label}</span>
          {isSettled && prop.actual_value !== null && prop.actual_value !== undefined && (
            <span className="text-xs text-text-muted whitespace-nowrap">
              Actual: <span className="font-semibold text-accent">{prop.actual_value}</span>
            </span>
          )}
        </div>
        {prop.games && (
          <span className="text-xs text-text-muted whitespace-nowrap ml-2">
            {abbreviateTeam(prop.games.away_team)} @ {abbreviateTeam(prop.games.home_team)}
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => handleClick('over')}
          disabled={isLocked || isSubmitting || overState === 'locked' || overState === 'correct' || overState === 'incorrect'}
          className={`flex-1 p-3 rounded-xl border transition-all ${sideStyles[overState]} ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className={`font-semibold text-sm mb-1 ${overState === 'correct' ? 'text-correct' : overState === 'incorrect' ? 'text-incorrect' : 'text-text-primary'}`}>
            Over
          </div>
          {prop.over_odds && (
            <div className="text-center">
              <div className={`font-semibold text-sm ${overState === 'selected' ? 'text-white' : ''}`}>
                <span className="text-incorrect">-{calculateRiskPoints(prop.over_odds)}</span>
                <span className={overState === 'selected' ? 'text-white/70' : 'text-text-muted'}> → </span>
                <span className="text-correct">+{calculateRewardPoints(prop.over_odds)}</span>
              </div>
              <div className={`text-xs ${overState === 'selected' ? 'text-white/70' : 'text-text-muted'}`}>
                {formatOdds(prop.over_odds)}
              </div>
            </div>
          )}
        </button>

        <button
          onClick={() => handleClick('under')}
          disabled={isLocked || isSubmitting || underState === 'locked' || underState === 'correct' || underState === 'incorrect'}
          className={`flex-1 p-3 rounded-xl border transition-all ${sideStyles[underState]} ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className={`font-semibold text-sm mb-1 ${underState === 'correct' ? 'text-correct' : underState === 'incorrect' ? 'text-incorrect' : 'text-text-primary'}`}>
            Under
          </div>
          {prop.under_odds && (
            <div className="text-center">
              <div className={`font-semibold text-sm ${underState === 'selected' ? 'text-white' : ''}`}>
                <span className="text-incorrect">-{calculateRiskPoints(prop.under_odds)}</span>
                <span className={underState === 'selected' ? 'text-white/70' : 'text-text-muted'}> → </span>
                <span className="text-correct">+{calculateRewardPoints(prop.under_odds)}</span>
              </div>
              <div className={`text-xs ${underState === 'selected' ? 'text-white/70' : 'text-text-muted'}`}>
                {formatOdds(prop.under_odds)}
              </div>
            </div>
          )}
        </button>
      </div>

      {pick?.status === 'settled' && pick.points_earned !== null && (
        <div className={`mt-3 text-center text-sm font-semibold ${pick.points_earned > 0 ? 'text-correct' : pick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'}`}>
          {pick.points_earned > 0 ? '+' : ''}{pick.points_earned} pts
        </div>
      )}

      {pick?.status === 'locked' && pick.odds_at_pick != null && (
        <div className="mt-3 text-center text-sm text-text-muted">
          <span className="text-incorrect">-{calculateRiskPoints(pick.odds_at_pick)}</span>
          {' / '}
          <span className="text-correct">+{calculateRewardPoints(pick.odds_at_pick)}</span>
        </div>
      )}
    </div>
  )
}
