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
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="w-24 h-24 mx-auto mb-3 object-contain"
            onError={(e) => {
              const fb = getTeamLogoFallbackUrl(pick.picked_team_name, game.sport_key)
              if (fb && e.target.src !== fb) e.target.src = fb
              else e.target.style.display = 'none'
            }}
          />
        ) : (
          <div className="text-5xl mb-3">{'🐶'}</div>
        )}

        <div className={`inline-flex items-center px-4 py-1.5 rounded-full border mb-3 ${
          tier === 'marquee'
            ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-400'
            : 'border-correct/60 bg-correct/10 text-correct'
        }`}>
          <span className="font-bold text-sm tracking-wider">
            UNDERDOG HIT {formatOdds(pick.odds_at_pick)}
          </span>
        </div>

        <div className="font-display text-xl text-text-primary">
          {pick.picked_team_name}
        </div>
        <div className="text-xs text-text-muted mt-1">
          {game.sport_name && <span className="uppercase tracking-wider mr-2">{game.sport_name}</span>}
          {game.away_team} @ {game.home_team}
        </div>

        <div className="mt-4 font-display text-3xl font-bold text-correct">
          W +{pick.points_earned}
        </div>
      </div>
    </FeedCardWrapper>
  )
}
