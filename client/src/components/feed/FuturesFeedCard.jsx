import FeedCardWrapper from './FeedCardWrapper'

function formatOdds(odds) {
  if (odds == null) return ''
  return odds > 0 ? `+${odds}` : `${odds}`
}

export default function FuturesFeedCard({ item, onUserTap }) {
  const { futures } = item
  const isHit = item.type === 'futures_hit'

  return (
    <FeedCardWrapper
      item={item}
      borderColor={isHit ? 'gold' : undefined}
      onUserTap={onUserTap}
    >
      {isHit ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{'\uD83C\uDFC6'}</span>
            <span className="font-bold text-sm text-yellow-500">Futures Hit!</span>
          </div>

          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2.5">
            <div className="font-semibold text-sm text-text-primary">{futures.picked_outcome}</div>
            <div className="text-xs text-text-muted mt-0.5">{futures.market_title}</div>
            <div className="flex items-center gap-3 mt-2 text-sm">
              <span className="text-yellow-500 font-bold">{formatOdds(futures.odds_at_submission)}</span>
              {futures.points_earned != null && (
                <span className="text-correct font-bold">+{futures.points_earned} pts</span>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{'\uD83D\uDD2E'}</span>
            <span className="font-semibold text-sm text-text-secondary">Futures Pick</span>
          </div>

          <div className="bg-bg-secondary rounded-lg px-3 py-2.5">
            <div className="font-semibold text-sm text-text-primary">{futures.picked_outcome}</div>
            <div className="text-xs text-text-muted mt-0.5">{futures.market_title}</div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-accent font-bold">{formatOdds(futures.odds_at_submission)}</span>
              <span className="text-text-muted">locked in</span>
            </div>
          </div>
        </>
      )}
    </FeedCardWrapper>
  )
}
