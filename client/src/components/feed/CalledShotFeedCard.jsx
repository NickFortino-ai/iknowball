import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

function timeGap(sharedAt, settledAt) {
  const ms = new Date(settledAt) - new Date(sharedAt)
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours < 1) return 'less than an hour'
  if (hours === 1) return '1 hour'
  return `${hours} hours`
}

export default function CalledShotFeedCard({ item, reactions, onUserTap }) {
  const gap = timeGap(item.shared_at, item.settled_at)

  return (
    <FeedCardWrapper
      item={item}
      borderColor="gold"
      targetType="pick"
      targetId={item.pick_id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      cardClassName="feed-victory-entrance underdog-gold-glow"
    >
      {/* Banner */}
      <div className="mb-2 rounded-lg px-3 py-3 text-center border bg-yellow-500/15 border-yellow-500/40">
        <div className="font-bold text-yellow-400 text-lg">CALLED IT</div>
        <div className="text-xs text-yellow-400/70 mt-0.5">
          Shared this pick {gap} ago
        </div>
      </div>

      {/* Sport tag */}
      {item.game?.sport_name && (
        <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          {item.game.sport_name}
        </span>
      )}

      {/* Matchup */}
      <div className="text-sm text-text-secondary mt-0.5">
        {item.game?.away_team} @ {item.game?.home_team}
      </div>

      {/* Pick details */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{item.picked_team_name}</span>
          <span className="text-xs text-text-muted">{formatOdds(item.odds_at_pick)}</span>
        </div>
        <span className="font-bold text-lg text-correct">
          W +{item.points_earned}
        </span>
      </div>
    </FeedCardWrapper>
  )
}
