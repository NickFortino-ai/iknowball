import EmptyState from '../ui/EmptyState'
import Avatar from '../ui/Avatar'

export default function BracketStandings({ entries, championshipTotalScore, onViewBracket }) {
  if (!entries?.length) {
    return <EmptyState title="No entries yet" message="No one has submitted a bracket yet" />
  }

  const hasActualScore = championshipTotalScore != null

  return (
    <div>
      <div className="bg-bg-primary/50 backdrop-blur-sm rounded-xl border border-text-primary/20 overflow-hidden text-sm">
        {/* Header */}
        <div className="flex items-center border-b border-text-primary/10 text-text-muted text-xs uppercase tracking-wider">
          <span className="px-4 py-3 font-medium w-10">#</span>
          <span className="px-4 py-3 font-medium flex-1">Player</span>
          <span className="px-4 py-3 font-medium text-right">Points</span>
          <span className="px-4 py-3 font-medium text-right">Possible</span>
          {hasActualScore && (
            <span className="px-4 py-3 font-medium text-right">TB Dist.</span>
          )}
        </div>
        {/* Rows */}
        {entries.map((e, i) => {
          const distance = e.tiebreaker_distance
          const Row = onViewBracket ? 'button' : 'div'

          return (
            <Row
              key={e.user_id}
              {...(onViewBracket ? { onClick: () => onViewBracket(e.user_id) } : {})}
              className={`w-full text-left flex items-center py-1 ${i < entries.length - 1 ? 'border-b border-text-primary/10' : ''} ${onViewBracket ? 'hover:bg-text-primary/5 cursor-pointer' : ''} transition-colors`}
            >
              <span className="px-4 py-3 text-accent font-semibold w-10">{i + 1}</span>
              <div className="px-4 py-3 flex-1 min-w-0 flex items-center gap-3">
                <Avatar user={e.users} size="lg" />
                <span className="font-semibold truncate">
                  {e.users?.display_name || e.users?.username}
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
              <span className="px-4 py-3 text-right text-text-primary whitespace-nowrap">{e.possible_points}</span>
              {hasActualScore && (
                <span className="px-4 py-3 text-right whitespace-nowrap">
                  {distance != null ? (
                    distance === 0 ? (
                      <span className="text-correct font-semibold">Exact!</span>
                    ) : (
                      <span className="text-text-secondary">+{distance}</span>
                    )
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </span>
              )}
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
