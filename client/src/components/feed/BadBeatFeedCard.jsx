import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  if (odds == null) return ''
  return odds >= 0 ? `+${odds}` : `${odds}`
}

function americanToDecimal(odds) {
  if (odds == null) return 2
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds)
}

// Recompute would-have-won from leg odds rather than trusting parlay.reward_points,
// which is stale/wrong on some older parlay records (saw a 7-leg parlay rendering
// "7 pts" because its stored reward_points was bad).
function computeWouldHaveWon(parlay) {
  if (!parlay.legs?.length) return parlay.reward_points || 0
  const combined = parlay.legs.reduce((acc, l) => acc * americanToDecimal(l.odds), 1)
  const risk = parlay.risk_points || 10
  return Math.max(1, Math.round(risk * (combined - 1)))
}

export default function BadBeatFeedCard({ item, reactions, onUserTap }) {
  const { parlay } = item
  const wonLegs = parlay.legs?.filter((l) => l.status === 'won').length || 0
  const wouldHaveWon = computeWouldHaveWon(parlay)

  return (
    <FeedCardWrapper
      item={item}
      borderColor="red"
      targetType="parlay"
      targetId={parlay.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
    >
      {/* Banner */}
      <div className="mb-2 bg-incorrect/10 border border-incorrect/30 rounded-lg px-3 py-2 text-center">
        <span className="text-incorrect font-bold text-sm">
          {'\uD83D\uDC80'} BAD BEAT &mdash; {wonLegs} of {parlay.leg_count} legs hit
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
                legLost ? 'bg-incorrect/15 border border-incorrect/30' : 'bg-bg-primary'
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="text-text-muted">{leg.sport_name}</span>
                <span className="mx-1 text-text-muted">&middot;</span>
                <span className={`font-medium ${legLost ? 'line-through text-text-muted' : ''}`}>
                  {leg.picked_team_name}
                </span>
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

      {/* Would have won — prominent */}
      <div className="mt-2 text-sm text-text-secondary text-center font-medium">
        Would have won <span className="text-correct">{wouldHaveWon} pts</span>
      </div>
    </FeedCardWrapper>
  )
}
