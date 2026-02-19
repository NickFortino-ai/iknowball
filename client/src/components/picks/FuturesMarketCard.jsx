import { useState, useMemo } from 'react'
import { formatOdds, calculateRiskPoints, calculateRewardPoints } from '../../lib/scoring'

export default function FuturesMarketCard({ market, userPick, onPick, isSubmitting }) {
  const [expanded, setExpanded] = useState(false)

  const outcomes = useMemo(() => {
    const raw = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || []
    return raw.sort((a, b) => a.odds - b.odds)
  }, [market.outcomes])

  const displayedOutcomes = expanded ? outcomes : outcomes.slice(0, 8)
  const hasPick = !!userPick

  function handleOutcomeClick(outcomeName) {
    if (isSubmitting || hasPick) return
    onPick(market.id, outcomeName)
  }

  return (
    <div className="bg-bg-card rounded-2xl border border-border p-4">
      <h3 className="font-display text-base mb-1">{market.title}</h3>
      <p className="text-xs text-text-muted mb-3">
        {outcomes.length} outcomes
        {userPick && (
          <span className="ml-2 text-accent font-semibold">
            Your pick: {userPick.picked_outcome}
          </span>
        )}
      </p>

      <div className="space-y-1.5">
        {displayedOutcomes.map((outcome) => {
          const isPicked = userPick?.picked_outcome === outcome.name
          const risk = calculateRiskPoints(outcome.odds)
          const reward = calculateRewardPoints(outcome.odds)

          return (
            <button
              key={outcome.name}
              onClick={() => handleOutcomeClick(outcome.name)}
              disabled={isSubmitting || (hasPick && !isPicked)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors text-left ${
                isPicked
                  ? userPick.status === 'settled'
                    ? userPick.is_correct
                      ? 'bg-correct/10 border-correct'
                      : 'bg-incorrect/10 border-incorrect'
                    : 'bg-accent/15 border-accent'
                  : hasPick
                    ? 'border-border opacity-40'
                    : 'border-border hover:bg-bg-card-hover'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className={`font-semibold text-sm ${isPicked ? 'text-accent' : 'text-text-primary'}`}>
                {outcome.name}
              </span>
              <div className="text-right shrink-0 ml-3">
                <div className="text-sm font-semibold">
                  <span className="text-incorrect">-{risk}</span>
                  <span className="text-text-muted mx-1">&rarr;</span>
                  <span className="text-correct">+{reward}</span>
                </div>
                <div className="text-xs text-text-muted">{formatOdds(outcome.odds)}</div>
              </div>
            </button>
          )
        })}
      </div>

      {outcomes.length > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-2 text-center text-sm text-accent hover:underline py-2"
        >
          {expanded ? 'Show less' : `Show all ${outcomes.length} outcomes`}
        </button>
      )}

      {userPick?.status === 'locked' && (
        <div className="mt-3 pt-3 border-t border-border text-center text-sm text-text-muted">
          Locked: {userPick.picked_outcome} at {formatOdds(userPick.odds_at_submission)}
          {' '}
          <span className="text-incorrect">-{userPick.risk_at_submission}</span>
          {' / '}
          <span className="text-correct">+{userPick.reward_at_submission}</span>
        </div>
      )}

      {userPick?.status === 'settled' && userPick.points_earned != null && (
        <div className={`mt-3 pt-3 border-t border-border text-center text-sm font-semibold ${
          userPick.points_earned > 0 ? 'text-correct' : userPick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
        }`}>
          {userPick.points_earned > 0 ? '+' : ''}{userPick.points_earned} pts
          {userPick.futures_markets?.winning_outcome && (
            <span className="text-text-muted font-normal"> &middot; Winner: {userPick.futures_markets.winning_outcome}</span>
          )}
        </div>
      )}
    </div>
  )
}
