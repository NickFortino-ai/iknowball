import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

export default function PickFeedCard({ item, reactions, onUserTap }) {
  const { pick, game } = item
  const won = pick.is_correct
  const borderColor = won ? 'green' : 'red'

  return (
    <FeedCardWrapper
      item={item}
      borderColor={borderColor}
      targetType="pick"
      targetId={pick.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      streakCount={item.current_streak}
    >
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
          {pick.multiplier > 1 && (
            <span className="text-[10px] font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded">
              {pick.multiplier}x
            </span>
          )}
        </div>

        {/* Result */}
        <div className="text-right">
          <span className={`font-bold text-sm ${won ? 'text-correct' : 'text-incorrect'}`}>
            {won ? 'W' : 'L'} {won ? `+${pick.points_earned}` : `-${pick.risk_points}`}
          </span>
        </div>
      </div>
    </FeedCardWrapper>
  )
}
