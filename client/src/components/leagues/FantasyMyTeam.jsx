import { useFantasyRoster } from '../../hooks/useLeagues'
import LoadingSpinner from '../ui/LoadingSpinner'

const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
}

function InjuryBadge({ status }) {
  if (!status) return null
  const label = status === 'Day-To-Day' ? 'DTD' : status.charAt(0)
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'}`} title={status}>
      {label}
    </span>
  )
}

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
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-text-primary truncate">{r.nfl_players?.full_name}</span>
              <InjuryBadge status={r.nfl_players?.injury_status} />
            </div>
            <div className="text-xs text-text-muted">{r.nfl_players?.position} · {r.nfl_players?.team || 'FA'}</div>
          </div>
          <span className="text-xs text-text-muted uppercase">{r.slot}</span>
        </div>
      ))}
    </div>
  )
}
