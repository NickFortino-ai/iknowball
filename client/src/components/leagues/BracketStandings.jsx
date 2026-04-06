import EmptyState from '../ui/EmptyState'
import Avatar from '../ui/Avatar'

export default function BracketStandings({ entries, championshipTotalScore, onViewBracket, isCompleted }) {
  if (!entries?.length) {
    return <EmptyState title="No entries yet" message="No one has submitted a bracket yet" />
  }

  const hasActualScore = championshipTotalScore != null

  return (
    <div>
      <div className="bg-bg-primary/50 backdrop-blur-sm rounded-xl border border-text-primary/20 overflow-x-auto text-sm">
        <table className="w-full min-w-[420px]">
          <thead>
            <tr className="border-b border-text-primary/10 text-text-muted text-xs uppercase tracking-wider">
              <th className="px-3 py-3 text-left font-medium w-10">#</th>
              <th className="px-3 py-3 text-left font-medium">Player</th>
              <th className="px-3 py-3 text-right font-medium w-20">Points</th>
              {!isCompleted && <th className="px-3 py-3 text-right font-medium w-20">Possible</th>}
              {hasActualScore && (
                <th className="px-3 py-3 text-right font-medium w-16">TB</th>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const distance = e.tiebreaker_distance

              return (
                <tr
                  key={e.user_id}
                  onClick={onViewBracket ? () => onViewBracket(e.user_id) : undefined}
                  className={`${i < entries.length - 1 ? 'border-b border-text-primary/10' : ''} ${onViewBracket ? 'hover:bg-text-primary/5 cursor-pointer' : ''} transition-colors`}
                >
                  <td className="px-3 py-3 text-accent font-semibold">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar user={e.users} size="lg" />
                      <span className="font-semibold truncate max-w-[140px] sm:max-w-none">
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
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-accent whitespace-nowrap">{e.total_points}</td>
                  {!isCompleted && <td className="px-3 py-3 text-right text-text-primary whitespace-nowrap">{e.possible_points}</td>}
                  {hasActualScore && (
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {distance != null ? (
                        distance === 0 ? (
                          <span className="text-correct font-semibold">Exact!</span>
                        ) : (
                          <span className="text-text-secondary">+{distance}</span>
                        )
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasActualScore && (
        <div className="text-center text-xs text-text-muted mt-3">
          Championship total score: <span className="font-semibold text-text-secondary">{championshipTotalScore}</span>
        </div>
      )}
    </div>
  )
}
