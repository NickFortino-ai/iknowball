import { useState, useMemo } from 'react'
import { calculateRiskPoints, calculateRewardPoints } from '../../lib/scoring'

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
    <div className="bg-bg-primary rounded-2xl border border-text-primary/20 p-4">
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
          const liveRisk = calculateRiskPoints(outcome.odds)
          const liveReward = calculateRewardPoints(outcome.odds)
          const lockedRisk = isPicked ? userPick.risk_at_submission : null
          const lockedReward = isPicked ? userPick.reward_at_submission : null
          const oddsChanged = isPicked && (lockedRisk !== liveRisk || lockedReward !== liveReward)

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
                    ? 'border-text-primary/10 opacity-40'
                    : 'border-text-primary/20 hover:bg-text-primary/5'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="font-semibold text-sm text-text-primary">
                {outcome.name}
              </span>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                {isPicked && (
                  <div className="text-right">
                    <div className="text-[10px] text-text-primary uppercase tracking-wider leading-none">Your locked</div>
                    <div className="text-base font-semibold mt-0.5">
                      <span className="text-incorrect">-{lockedRisk}</span>
                      <span className="text-text-muted mx-1">&rarr;</span>
                      <span className="text-correct">+{lockedReward}</span>
                    </div>
                  </div>
                )}
                <div className="text-right">
                  {isPicked && (
                    <div className="text-[10px] text-text-muted uppercase tracking-wider leading-none">Live</div>
                  )}
                  <div className={`font-semibold ${isPicked ? 'text-sm mt-0.5 opacity-70' : 'text-base'} ${isPicked && !oddsChanged ? 'opacity-50' : ''}`}>
                    <span className="text-incorrect">-{liveRisk}</span>
                    <span className="text-text-muted mx-1">&rarr;</span>
                    <span className="text-correct">+{liveReward}</span>
                  </div>
                </div>
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

      {userPick?.status === 'settled' && userPick.points_earned != null && (
        <div className={`mt-3 pt-3 border-t border-text-primary/10 text-center text-sm font-semibold ${
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
