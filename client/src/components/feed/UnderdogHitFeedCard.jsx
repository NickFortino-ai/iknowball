import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

function getOddsTier(odds) {
  if (odds >= 500) return 'marquee'
  if (odds >= 300) return 'bold'
  return 'normal'
}

export default function UnderdogHitFeedCard({ item, reactions, onUserTap }) {
  const { pick, game } = item
  const tier = getOddsTier(pick.odds_at_pick)

  const cardClass = `feed-victory-entrance ${tier === 'marquee' ? 'underdog-gold-glow' : ''}`

  return (
    <FeedCardWrapper
      item={item}
      borderColor={tier === 'marquee' ? 'gold' : 'green'}
      targetType="pick"
      targetId={pick.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      streakCount={item.current_streak}
      cardClassName={cardClass}
    >
      {/* Banner */}
      <div className={`mb-2 rounded-lg px-3 text-center border ${
        tier === 'marquee'
          ? 'bg-yellow-500/15 border-yellow-500/40 py-3'
          : tier === 'bold'
          ? 'bg-correct/10 border-correct/30 py-2'
          : 'bg-correct/10 border-correct/30 py-2'
      }`}>
        <span className={`font-bold ${
          tier === 'marquee'
            ? 'text-yellow-400 text-lg'
            : tier === 'bold'
            ? 'text-correct text-base'
            : 'text-correct text-sm'
        }`}>
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
        <span className={`font-bold text-correct ${tier === 'marquee' ? 'text-lg' : 'text-sm'}`}>
          W +{pick.points_earned}
        </span>
      </div>
    </FeedCardWrapper>
  )
}
