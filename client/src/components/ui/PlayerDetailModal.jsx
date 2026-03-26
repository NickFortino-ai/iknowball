import { useNbaDfsPlayerGamelog } from '../../hooks/useLeagues'
import LoadingSpinner from './LoadingSpinner'

function InjuryBadge({ status }) {
  if (!status) return null
  const colors = {
    Out: 'bg-incorrect/20 text-incorrect',
    Questionable: 'bg-yellow-500/20 text-yellow-500',
    Probable: 'bg-correct/20 text-correct',
    'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
  }
  const label = status === 'Day-To-Day' ? 'DTD' : status.charAt(0)
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors[status] || 'bg-text-primary/10 text-text-muted'}`} title={status}>
      {label}
    </span>
  )
}

export default function PlayerDetailModal({ player, onClose, onAdd }) {
  const { data, isLoading } = useNbaDfsPlayerGamelog(player?.espn_player_id)

  if (!player) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-text-primary/10">
          <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none">&times;</button>
          <div className="flex items-center gap-4">
            {player.headshot_url || player.player_headshot_url ? (
              <img src={player.headshot_url || player.player_headshot_url} alt="" className="w-16 h-16 rounded-full object-cover bg-bg-secondary shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-lg text-text-muted font-bold">
                {(player.position || '?').split('/')[0]}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl text-text-primary">{player.player_name}</h2>
                <InjuryBadge status={player.injury_status} />
              </div>
              {(player.position || player.team) && (
                <div className="text-sm text-text-muted">
                  {[player.position, player.team, player.opponent].filter(Boolean).join(' · ')}
                </div>
              )}
              {player.salary && (
                <div className="text-lg font-semibold text-accent mt-1">${player.salary.toLocaleString()}</div>
              )}
            </div>
          </div>
          {onAdd && (
            <button
              onClick={() => { onAdd(player); onClose() }}
              className="w-full mt-4 py-2.5 rounded-xl font-display text-sm bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Add to Roster
            </button>
          )}
        </div>

        {/* Season Averages */}
        {data?.averages && (
          <div className="px-5 py-4 border-b border-text-primary/10">
            <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3 font-semibold">Season Averages</h3>
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: 'PTS', value: data.averages.ppg },
                { label: 'REB', value: data.averages.rpg },
                { label: 'AST', value: data.averages.apg },
                { label: 'GP', value: data.averages.gp },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-lg font-display text-text-primary">{s.value}</div>
                  <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-3 text-center mt-2">
              {[
                { label: 'STL', value: data.averages.spg },
                { label: 'BLK', value: data.averages.bpg },
                { label: 'TO', value: data.averages.tpg },
                { label: 'MIN', value: data.averages.mpg },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-lg font-display text-text-primary">{s.value}</div>
                  <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Game Log */}
        <div className="px-5 py-4">
          <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3 font-semibold">Recent Games</h3>
          {isLoading ? (
            <LoadingSpinner />
          ) : !data?.games?.length ? (
            <p className="text-sm text-text-muted text-center py-4">No recent games found.</p>
          ) : (
            <div className="space-y-0">
              <div className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem] gap-x-1 text-[10px] text-text-muted uppercase tracking-wider pb-2 border-b border-text-primary/10">
                <span></span><span>OPP</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span><span className="text-right">STL</span><span className="text-right">BLK</span>
              </div>
              {data.games.map((g, i) => (
                <div key={i} className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem] gap-x-1 py-2 border-b border-text-primary/5 last:border-b-0 items-center">
                  <span className={`text-[10px] font-bold ${g.result === 'W' ? 'text-correct' : 'text-incorrect'}`}>{g.result}</span>
                  <span className="text-xs text-text-secondary truncate">{g.opponent?.split(' ').pop()}</span>
                  <span className="text-xs text-text-primary text-right font-semibold">{g.pts}</span>
                  <span className="text-xs text-text-secondary text-right">{g.reb}</span>
                  <span className="text-xs text-text-secondary text-right">{g.ast}</span>
                  <span className="text-xs text-text-secondary text-right">{g.stl}</span>
                  <span className="text-xs text-text-secondary text-right">{g.blk}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
