import TierBadge from '../ui/TierBadge'
import { getTier } from '../../lib/scoring'
import EmptyState from '../ui/EmptyState'

export default function BracketStandings({ entries, championshipTotalScore, onViewBracket }) {
  if (!entries?.length) {
    return <EmptyState title="No entries yet" message="No one has submitted a bracket yet" />
  }

  const hasActualScore = championshipTotalScore != null

  return (
    <div>
      <div className="bg-bg-card rounded-xl border border-border overflow-hidden text-sm">
        {/* Header */}
        <div className="flex items-center border-b border-border text-text-muted text-xs">
          <span className="px-4 py-3 font-medium w-10">#</span>
          <span className="px-4 py-3 font-medium flex-1">Player</span>
          <span className="px-4 py-3 font-medium text-right">Points</span>
          <span className="px-4 py-3 font-medium text-right">Possible</span>
          <span className="px-4 py-3 font-medium text-right">{hasActualScore ? 'TB Dist.' : 'TB Pred.'}</span>
        </div>
        {/* Rows */}
        {entries.map((e, i) => {
          const distance = e.tiebreaker_distance
          const prediction = e.tiebreaker_score
          const Row = onViewBracket ? 'button' : 'div'

          return (
            <Row
              key={e.user_id}
              {...(onViewBracket ? { onClick: () => onViewBracket(e.user_id) } : {})}
              className={`w-full text-left flex items-center ${i < entries.length - 1 ? 'border-b border-border' : ''} ${onViewBracket ? 'hover:bg-bg-card-hover cursor-pointer' : ''} transition-colors`}
            >
              <span className="px-4 py-3 text-text-muted font-semibold w-10">{i + 1}</span>
              <div className="px-4 py-3 flex-1 min-w-0 flex items-center gap-2">
                <TierBadge tier={getTier(e.user?.total_points || 0).name} size="xs" />
                <span className="font-semibold truncate">
                  {e.user?.display_name || e.user?.username}
                </span>
                {onViewBracket && (
                  <svg
                    className="w-3.5 h-3.5 text-text-muted flex-shrink-0"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
              <span className="px-4 py-3 text-right font-semibold text-accent whitespace-nowrap">{e.total_points}</span>
              <span className="px-4 py-3 text-right text-text-muted whitespace-nowrap">{e.possible_points}</span>
              <span className="px-4 py-3 text-right whitespace-nowrap">
                {hasActualScore ? (
                  distance != null ? (
                    distance === 0 ? (
                      <span className="text-correct font-semibold">Exact!</span>
                    ) : (
                      <span className="text-text-secondary">+{distance}</span>
                    )
                  ) : (
                    <span className="text-text-muted">-</span>
                  )
                ) : (
                  prediction != null ? (
                    <span className="text-text-secondary">{prediction}</span>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )
                )}
              </span>
            </Row>
          )
        })}
      </div>
      {hasActualScore && (
        <div className="text-center text-xs text-text-muted mt-3">
          Championship total score: <span className="font-semibold text-text-secondary">{championshipTotalScore}</span>
        </div>
      )}
    </div>
  )
}
