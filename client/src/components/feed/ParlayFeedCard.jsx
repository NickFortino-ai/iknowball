import { useState } from 'react'
import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  if (odds == null) return ''
  return odds >= 0 ? `+${odds}` : `${odds}`
}

export default function ParlayFeedCard({ item, reactions, onUserTap }) {
  const [expanded, setExpanded] = useState(false)
  const { parlay } = item
  const won = parlay.is_correct
  const borderColor = won ? 'green' : 'red'

  return (
    <FeedCardWrapper
      item={item}
      borderColor={borderColor}
      targetType="parlay"
      targetId={parlay.id}
      reactions={reactions}
      onUserTap={onUserTap}
    >
      {/* Collapsed view */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{parlay.leg_count}-Leg Parlay</span>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            won ? 'bg-correct/20 text-correct' : 'bg-incorrect/20 text-incorrect'
          }`}>
            {won ? 'WON' : 'LOST'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold text-sm ${won ? 'text-correct' : 'text-incorrect'}`}>
            {won ? `+${parlay.points_earned}` : `-${parlay.risk_points}`}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded legs */}
      {expanded && (
        <div className="mt-3 space-y-2">
          {parlay.legs?.map((leg, i) => {
            const legWon = leg.status === 'won'
            const legLost = leg.status === 'lost'
            return (
              <div
                key={i}
                className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
                  legLost ? 'bg-incorrect/10' : 'bg-bg-secondary'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-text-muted">{leg.sport_name}</span>
                  <span className="mx-1 text-text-muted">·</span>
                  <span className="font-medium">{leg.picked_team_name}</span>
                  <span className="text-text-muted ml-1">{formatOdds(leg.odds)}</span>
                </div>
                <span className={`ml-2 font-bold flex-shrink-0 ${
                  legWon ? 'text-correct' : legLost ? 'text-incorrect' : 'text-text-muted'
                }`}>
                  {legWon ? 'W' : legLost ? 'L' : leg.status === 'push' ? 'P' : '-'}
                </span>
              </div>
            )
          })}
          {parlay.combined_multiplier && (
            <div className="text-xs text-text-muted text-right">
              Combined: {parlay.combined_multiplier}x
            </div>
          )}
        </div>
      )}
    </FeedCardWrapper>
  )
}
