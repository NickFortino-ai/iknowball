import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

export default function PickFeedCard({ item, reactions, onUserTap }) {
  const { pick, game } = item
  const won = pick.is_correct
  const borderColor = won ? 'green' : 'red'
  const isDramatic = pick.multiplier >= 3 && won

  return (
    <FeedCardWrapper
      item={item}
      borderColor={borderColor}
      targetType="pick"
      targetId={pick.id}
      reactions={reactions}
      onUserTap={onUserTap}
    >
      {/* Dramatic banner for 3x/4x wins */}
      {isDramatic && (
        <div className="mb-2 bg-correct/10 border border-correct/30 rounded-lg px-3 py-2 text-center">
          <span className="text-correct font-bold text-sm">
            {pick.multiplier}x MULTIPLIER WIN +{pick.points_earned} pts
          </span>
        </div>
      )}

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
