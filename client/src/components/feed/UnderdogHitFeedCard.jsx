import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

export default function UnderdogHitFeedCard({ item, reactions, onUserTap }) {
  const { pick, game } = item

  return (
    <FeedCardWrapper
      item={item}
      borderColor="gold"
      targetType="pick"
      targetId={pick.id}
      reactions={reactions}
      onUserTap={onUserTap}
    >
      {/* Banner */}
      <div className="mb-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-center">
        <span className="text-yellow-500 font-bold text-sm">
          UNDERDOG HIT {formatOdds(pick.odds_at_pick)}
        </span>
      </div>

      {/* Sport tag */}
      {game.sport_name && (
        <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          {game.sport_name}
        </span>
      )}

      {/* Matchup */}
      <div className="text-sm text-text-secondary mt-0.5">
        {game.away_team} @ {game.home_team}
      </div>

      {/* Pick details */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{pick.picked_team_name}</span>
          <span className="text-xs text-text-muted">{formatOdds(pick.odds_at_pick)}</span>
        </div>
        <span className="font-bold text-sm text-correct">
          W +{pick.points_earned}
        </span>
      </div>
    </FeedCardWrapper>
  )
}
