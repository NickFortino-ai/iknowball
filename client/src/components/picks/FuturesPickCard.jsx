export default function FuturesPickCard({ pick }) {
  const market = pick.futures_markets

  return (
    <div className={`bg-bg-primary rounded-2xl border ${
      pick.status === 'settled'
        ? pick.is_correct ? 'border-correct/40' : 'border-incorrect/40'
        : 'border-text-primary/20'
    } p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm text-text-primary truncate">
          {market?.title || 'Futures'}
        </span>
        {pick.status === 'locked' && (
          <span className="text-xs font-semibold text-accent">
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
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-primary truncate">{pick.picked_outcome}</div>
          <div className="text-[10px] text-text-primary uppercase tracking-wider mt-0.5">Your locked</div>
        </div>
        <div className="text-right shrink-0 ml-3">
          {pick.status === 'settled' && pick.points_earned != null ? (
            <div className={`text-lg font-display ${
              pick.points_earned > 0 ? 'text-correct' : pick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
            }`}>
              {pick.points_earned > 0 ? '+' : ''}{pick.points_earned}
            </div>
          ) : (
            <div className="text-base font-semibold">
              <span className="text-incorrect">-{pick.risk_at_submission}</span>
              <span className="text-text-muted mx-1">&rarr;</span>
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
