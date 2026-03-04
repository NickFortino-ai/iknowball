import TierBadge from '../ui/TierBadge'
import { getTier } from '../../lib/scoring'
import EmptyState from '../ui/EmptyState'

export default function BracketStandings({ entries, championshipTotalScore }) {
  if (!entries?.length) {
    return <EmptyState title="No entries yet" message="No one has submitted a bracket yet" />
  }

  const hasActualScore = championshipTotalScore != null

  return (
    <div>
      <div className="bg-bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs">
              <th className="text-left px-4 py-3 font-medium">#</th>
              <th className="text-left px-4 py-3 font-medium">Player</th>
              <th className="text-right px-4 py-3 font-medium">Points</th>
              <th className="text-right px-4 py-3 font-medium">Possible</th>
              <th className="text-right px-4 py-3 font-medium">{hasActualScore ? 'TB Dist.' : 'TB Pred.'}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const distance = e.tiebreaker_distance
              const prediction = e.tiebreaker_score

              return (
                <tr key={e.user_id} className="border-b border-border last:border-0 hover:bg-bg-card-hover">
                  <td className="px-4 py-3 text-text-muted font-semibold">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={getTier(e.user?.total_points || 0).name} size="xs" />
                      <span className="font-semibold truncate">
                        {e.user?.display_name || e.user?.username}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-accent">{e.total_points}</td>
                  <td className="px-4 py-3 text-right text-text-muted">{e.possible_points}</td>
                  <td className="px-4 py-3 text-right">
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
                  </td>
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
