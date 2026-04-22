import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

export default function MultiplierFeedCard({ item, reactions, onUserTap }) {
  const { pick, game } = item
  const isHit = item.type === 'multiplier_hit'

  return (
    <FeedCardWrapper
      item={item}
      borderColor={isHit ? 'green' : 'red'}
      targetType="pick"
      targetId={pick.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      streakCount={item.current_streak}
      cardClassName={`${isHit ? 'feed-victory-entrance multiplier-green-glow' : ''}`}
    >
      {/* Multiplier pill + result */}
      <div className="flex items-center gap-3 mb-2">
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${
          isHit
            ? 'text-correct'
            : 'text-incorrect'
        }`}>
          {pick.multiplier}x
        </span>
        <span className={`font-bold text-lg ${isHit ? 'text-correct' : 'text-incorrect'}`}>
          {isHit ? `+${pick.points_earned} pts` : `${'\uD83D\uDC80'} -${pick.risk_points} pts`}
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
        <span className={`font-bold text-sm ${isHit ? 'text-correct' : 'text-incorrect'}`}>
          {isHit ? 'W' : 'L'}
        </span>
      </div>
    </FeedCardWrapper>
  )
}
