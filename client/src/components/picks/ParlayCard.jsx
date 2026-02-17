import { useState } from 'react'
import { formatOdds } from '../../lib/scoring'

export default function ParlayCard({ parlay, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  const isWon = parlay.is_correct === true
  const isLost = parlay.is_correct === false
  const isPush = parlay.is_correct === null && parlay.status === 'settled'
  const isPending = parlay.status === 'pending'
  const isLocked = parlay.status === 'locked'

  const borderColor = isWon ? 'border-correct' : isLost ? 'border-incorrect' : isPending ? 'border-accent/50' : isLocked ? 'border-accent' : 'border-border'
  const badgeColor = isWon ? 'bg-correct/20 text-correct' : isLost ? 'bg-incorrect/20 text-incorrect' : isPending ? 'bg-accent/20 text-accent' : isLocked ? 'bg-accent/20 text-accent' : 'bg-bg-secondary text-text-muted'
  const badgeLabel = isWon ? 'Won' : isLost ? 'Lost' : isPending ? 'Pending' : isLocked ? 'Locked' : 'Push'

  return (
    <div className={`bg-bg-card rounded-2xl border ${borderColor} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-text-primary font-semibold text-sm">
            {parlay.leg_count}-Leg Parlay
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badgeLabel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {parlay.points_earned !== null && parlay.points_earned !== 0 && (
            <span className={`text-sm font-semibold ${parlay.points_earned > 0 ? 'text-correct' : 'text-incorrect'}`}>
              {parlay.points_earned > 0 ? '+' : ''}{parlay.points_earned} pts
            </span>
          )}
          {(isPending || isLocked) && (
            <span className="text-sm text-text-muted">
              <span className="text-incorrect">-{parlay.risk_points}</span>
              {' / '}
              <span className="text-correct">+{parlay.reward_points}</span>
            </span>
          )}
          {isPush && (
            <span className="text-sm text-text-muted">0 pts</span>
          )}
          <span className="text-text-muted text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && parlay.parlay_legs && (
        <div className="px-4 pb-4 space-y-2">
          {parlay.parlay_legs.map((leg) => {
            const team = leg.picked_team === 'home' ? leg.games?.home_team : leg.games?.away_team
            const odds = leg.odds_at_lock ?? leg.odds_at_submission
            const legWon = leg.status === 'won'
            const legLost = leg.status === 'lost'
            const legPush = leg.status === 'push'

            return (
              <div key={leg.id} className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-text-muted text-xs uppercase">
                    {leg.games?.sports?.name || ''}
                  </span>
                  <span className="text-text-primary font-medium truncate">{team}</span>
                  {odds != null && (
                    <span className="text-text-muted text-xs">{formatOdds(odds)}</span>
                  )}
                </div>
                <span className={`text-xs font-bold ${legWon ? 'text-correct' : legLost ? 'text-incorrect' : legPush ? 'text-text-muted' : ''}`}>
                  {legWon ? 'W' : legLost ? 'L' : legPush ? 'P' : ''}
                </span>
              </div>
            )
          })}
          <div className="text-center text-xs text-text-muted pt-1">
            Combined: {Number(parlay.combined_multiplier).toFixed(2)}x
          </div>
          {isPending && onDelete && (
            <button
              onClick={() => onDelete(parlay.id)}
              className="w-full mt-1 py-2 rounded-lg text-sm font-semibold text-incorrect bg-incorrect/10 hover:bg-incorrect/20 transition-colors"
            >
              Delete Parlay
            </button>
          )}
        </div>
      )}
    </div>
  )
}
