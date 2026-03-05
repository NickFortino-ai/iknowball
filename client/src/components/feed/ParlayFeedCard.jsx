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
  const isDramatic = won && parlay.leg_count >= 4
  const isDogParlay = parlay.isDogParlay

  return (
    <FeedCardWrapper
      item={item}
      borderColor={isDogParlay && won ? 'gold' : won ? 'green' : 'red'}
      targetType="parlay"
      targetId={parlay.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      cardClassName={`${won ? 'feed-victory-entrance' : ''} ${isDramatic ? 'parlay-win-glow' : ''} ${isDogParlay && won ? 'underdog-gold-glow' : ''}`.trim()}
    >
      {/* Collapsed view */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isDramatic ? 'text-base' : 'text-sm'}`}>
            {isDogParlay ? `${'\uD83D\uDC36'} Dog Parlay` : `${parlay.leg_count}-Leg Parlay`}
          </span>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            won ? 'bg-correct/20 text-correct' : 'bg-incorrect/20 text-incorrect'
          }`}>
            {won ? 'WON' : 'LOST'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold text-correct ${isDramatic ? 'text-lg' : 'text-sm'}`}>
            {won ? `+${parlay.points_earned}` : ''}
          </span>
          {!won && (
            <span className="font-bold text-sm text-incorrect">
              -{parlay.risk_points}
            </span>
          )}
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

      {/* Total odds for dramatic wins */}
      {isDramatic && parlay.combined_multiplier && (
        <div className="mt-1 text-xs text-text-muted">
          {parlay.combined_multiplier}x combined multiplier
        </div>
      )}

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
                  <span className="mx-1 text-text-muted">&middot;</span>
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
          {parlay.combined_multiplier && !isDramatic && (
            <div className="text-xs text-text-muted text-right">
              Combined: {parlay.combined_multiplier}x
            </div>
          )}
        </div>
      )}
    </FeedCardWrapper>
  )
}
