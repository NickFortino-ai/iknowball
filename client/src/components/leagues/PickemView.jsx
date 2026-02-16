import { Link } from 'react-router-dom'
import TierBadge from '../ui/TierBadge'
import { getTier } from '../../lib/scoring'
import EmptyState from '../ui/EmptyState'

export default function PickemView({ league, standings }) {
  const gamesPerWeek = league.settings?.games_per_week
  const useSubmissionOdds = league.settings?.lock_odds_at === 'submission'

  return (
    <div>
      {gamesPerWeek && (
        <div className="bg-bg-card rounded-xl border border-border p-3 mb-4 text-center">
          <span className="text-xs text-text-muted">Pick </span>
          <span className="text-sm font-semibold text-accent">{gamesPerWeek}</span>
          <span className="text-xs text-text-muted"> games per week</span>
        </div>
      )}

      {useSubmissionOdds && (
        <div className="bg-bg-card rounded-xl border border-border p-3 mb-4 text-center">
          <span className="text-xs text-text-muted">Odds locked </span>
          <span className="text-sm font-semibold text-accent">at submission</span>
        </div>
      )}

      <div className="bg-bg-card rounded-xl border border-border p-3 mb-4 text-center text-xs text-text-muted">
        Your regular picks on the{' '}
        <Link to="/picks" className="text-accent hover:underline">Picks page</Link>
        {' '}automatically count in this league
      </div>

      {!standings?.length ? (
        <EmptyState title="No standings yet" message="Make some picks to see standings" />
      ) : (
        <div className="bg-bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-xs">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Player</th>
                <th className="text-right px-4 py-3 font-medium">Record</th>
                <th className="text-right px-4 py-3 font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.user_id} className="border-b border-border last:border-0 hover:bg-bg-card-hover">
                  <td className="px-4 py-3 text-text-muted font-semibold">{s.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={getTier(s.user?.total_points || 0).name} size="xs" />
                      <span className="font-semibold truncate">
                        {s.user?.display_name || s.user?.username}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-text-muted">
                    {s.correct_picks}W-{s.total_picks - s.correct_picks}L
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-accent">{s.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
