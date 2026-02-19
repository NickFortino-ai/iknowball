import { formatOdds } from '../../lib/scoring'

export default function FuturesPickCard({ pick }) {
  const market = pick.futures_markets

  return (
    <div className={`bg-bg-card rounded-2xl border ${
      pick.status === 'settled'
        ? pick.is_correct ? 'border-correct' : 'border-incorrect'
        : 'border-accent'
    } p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm text-text-primary truncate">
          {market?.title || 'Futures'}
        </span>
        {pick.status === 'locked' && (
          <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded">
            Locked
          </span>
        )}
        {pick.status === 'settled' && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
            pick.is_correct ? 'text-correct bg-correct/10' : 'text-incorrect bg-incorrect/10'
          }`}>
            {pick.is_correct ? 'Won' : 'Lost'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-accent">{pick.picked_outcome}</div>
          <div className="text-xs text-text-muted">
            Odds: {formatOdds(pick.odds_at_submission)}
          </div>
        </div>
        <div className="text-right">
          {pick.status === 'settled' && pick.points_earned != null ? (
            <div className={`text-lg font-display ${
              pick.points_earned > 0 ? 'text-correct' : pick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
            }`}>
              {pick.points_earned > 0 ? '+' : ''}{pick.points_earned}
            </div>
          ) : (
            <div className="text-sm font-semibold">
              <span className="text-incorrect">-{pick.risk_at_submission}</span>
              <span className="text-text-muted"> / </span>
              <span className="text-correct">+{pick.reward_at_submission}</span>
            </div>
          )}
        </div>
      </div>

      {pick.status === 'settled' && market?.winning_outcome && (
        <div className="mt-2 text-xs text-text-muted text-center">
          Winner: {market.winning_outcome}
        </div>
      )}
    </div>
  )
}
