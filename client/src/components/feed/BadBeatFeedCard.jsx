import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  if (odds == null) return ''
  return odds >= 0 ? `+${odds}` : `${odds}`
}

export default function BadBeatFeedCard({ item, reactions, onUserTap }) {
  const { parlay } = item
  const wonLegs = parlay.legs?.filter((l) => l.status === 'won').length || 0

  return (
    <FeedCardWrapper
      item={item}
      borderColor="red"
      targetType="parlay"
      targetId={parlay.id}
      reactions={reactions}
      onUserTap={onUserTap}
    >
      {/* Banner */}
      <div className="mb-2 bg-incorrect/10 border border-incorrect/30 rounded-lg px-3 py-2 text-center">
        <span className="text-incorrect font-bold text-sm">
          BAD BEAT &mdash; {wonLegs} of {parlay.leg_count} legs hit
        </span>
      </div>

      {/* Always-expanded legs */}
      <div className="space-y-2">
        {parlay.legs?.map((leg, i) => {
          const legWon = leg.status === 'won'
          const legLost = leg.status === 'lost'
          return (
            <div
              key={i}
              className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
                legLost ? 'bg-incorrect/15 border border-incorrect/30' : 'bg-bg-secondary'
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
      </div>

      {/* Risk */}
      <div className="mt-2 text-xs text-text-muted text-right">
        Risked {parlay.risk_points} pts &middot; Would have won {parlay.reward_points} pts
      </div>
    </FeedCardWrapper>
  )
}
