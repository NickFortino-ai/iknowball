import { useFantasyRoster } from '../../hooks/useLeagues'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function FantasyMyTeam({ league }) {
  const { data: roster, isLoading } = useFantasyRoster(league.id)

  if (isLoading) return <LoadingSpinner />

  const hasRoster = roster && roster.length > 0

  if (!hasRoster) {
    return (
      <div className="text-center py-6">
        <div className="text-2xl mb-2">{'\uD83C\uDFC8'}</div>
        <p className="text-sm text-text-secondary">No players on your roster yet. Complete the draft to build your team.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-text-primary/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">My Roster</h3>
      </div>
      {roster.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0">
          {r.nfl_players?.headshot_url && (
            <img
              src={r.nfl_players.headshot_url}
              alt=""
              className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{r.nfl_players?.full_name}</div>
            <div className="text-xs text-text-muted">{r.nfl_players?.position} · {r.nfl_players?.team || 'FA'}</div>
          </div>
          <span className="text-xs text-text-muted uppercase">{r.slot}</span>
        </div>
      ))}
    </div>
  )
}
