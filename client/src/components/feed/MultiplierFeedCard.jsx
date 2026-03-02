import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

export default function MultiplierFeedCard({ item, reactions, onUserTap }) {
  const { pick, game } = item
  const isHit = item.type === 'multiplier_hit'
  const borderColor = isHit ? 'green' : 'red'

  const bannerText = isHit
    ? `${pick.multiplier}x MULTIPLIER HIT +${pick.points_earned} pts`
    : `${pick.multiplier}x MULTIPLIER MISS -${pick.risk_points} pts`

  return (
    <FeedCardWrapper
      item={item}
      borderColor={borderColor}
      targetType="pick"
      targetId={pick.id}
      reactions={reactions}
      onUserTap={onUserTap}
    >
      {/* Banner */}
      <div className={`mb-2 rounded-lg px-3 py-2 text-center border ${
        isHit
          ? 'bg-correct/10 border-correct/30'
          : 'bg-incorrect/10 border-incorrect/30'
      }`}>
        <span className={`font-bold text-sm ${isHit ? 'text-correct' : 'text-incorrect'}`}>
          {bannerText}
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
          <span className="text-[10px] font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded">
            {pick.multiplier}x
          </span>
        </div>
        <span className={`font-bold text-sm ${isHit ? 'text-correct' : 'text-incorrect'}`}>
          {isHit ? 'W' : 'L'} {isHit ? `+${pick.points_earned}` : `-${pick.risk_points}`}
        </span>
      </div>
    </FeedCardWrapper>
  )
}
