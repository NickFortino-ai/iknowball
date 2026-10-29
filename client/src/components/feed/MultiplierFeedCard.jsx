import FeedCardWrapper from './FeedCardWrapper'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

export default function MultiplierFeedCard({ item, reactions, onUserTap }) {
  const { pick, game } = item
  const isHit = item.type === 'multiplier_hit'
  const name = item.display_name || item.username
  const logoUrl = getTeamLogoUrl(pick.picked_team_name, game.sport_key)
  const hasScore = game.away_score != null && game.home_score != null

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
      <div className="text-center">
        {/* The multiple is the headline, so it leads. The sentence underneath
            says what actually happened — the old card opened with a bare
            "3x" pill and a point total, which reads as a score with no verb:
            nothing on it said a person had chosen to raise the stake. */}
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border-2 mb-2 ${
          isHit ? 'border-correct/40 text-correct' : 'border-incorrect/40 text-incorrect'
        }`}>
          <span className="font-bold text-lg tracking-wider">{pick.multiplier}x</span>
          <span className="text-xs font-semibold opacity-80">{formatOdds(pick.odds_at_pick)}</span>
        </div>

        <div className="text-sm text-text-secondary mb-3">
          <span className="font-semibold text-text-primary">{name}</span>
          {isHit ? ' multiplied this pick!' : ' multiplied this one'}
        </div>

        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            className="w-20 h-20 mx-auto mb-3 object-contain"
            onError={(e) => {
              const fb = getTeamLogoFallbackUrl(pick.picked_team_name, game.sport_key)
              if (fb && e.target.src !== fb) e.target.src = fb
              else e.target.style.display = 'none'
            }}
          />
        )}

        <div className="font-display text-xl text-text-primary">
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

        <div className={`mt-3 font-display text-2xl font-bold ${isHit ? 'text-correct' : 'text-incorrect'}`}>
          {isHit ? `W +${pick.points_earned}` : `L -${pick.risk_points}`}
        </div>
      </div>
    </FeedCardWrapper>
  )
}
