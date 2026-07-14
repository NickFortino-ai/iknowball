import FeedCardWrapper from './FeedCardWrapper'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'

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

  const logoUrl = getTeamLogoUrl(pick.picked_team_name, game.sport_key)
  const hasScore = game.home_score != null && game.away_score != null

  const pillColorClasses = tier === 'marquee'
    ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-400'
    : 'border-correct/60 bg-correct/10 text-correct'

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
      <div className="text-center">
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            className="w-28 h-28 mx-auto mb-4 object-contain"
            onError={(e) => {
              const fb = getTeamLogoFallbackUrl(pick.picked_team_name, game.sport_key)
              if (fb && e.target.src !== fb) e.target.src = fb
              else e.target.style.display = 'none'
            }}
          />
        )}

        <div className={`inline-flex flex-col items-center gap-1 px-6 py-3 rounded-xl border-2 mb-4 ${pillColorClasses}`}>
          <span className="font-bold text-xl tracking-wider">UNDERDOG HIT</span>
          <span className="text-sm font-semibold opacity-80">Odds: {formatOdds(pick.odds_at_pick)}</span>
        </div>

        <div className="font-display text-2xl text-text-primary">
          {pick.picked_team_name}
        </div>
        <div className="text-sm text-text-secondary mt-1">
          {game.sport_name && <span className="uppercase tracking-wider mr-2 text-text-muted">{game.sport_name}</span>}
          {game.away_team} @ {game.home_team}
        </div>

        {hasScore && (
          <div className="mt-2 text-sm font-semibold text-text-primary">
            Final: {game.away_score}–{game.home_score}
          </div>
        )}

        <div className="mt-4 font-display text-3xl font-bold text-correct">
          W +{pick.points_earned}
        </div>
      </div>
    </FeedCardWrapper>
  )
}
