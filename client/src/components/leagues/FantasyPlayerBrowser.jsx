import { useState } from 'react'
import { useAvailablePlayers, useFantasyRoster, useAddDropPlayer } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

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

export default function FantasyPlayerBrowser({ league }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [posFilter, setPosFilter] = useState('All')
  const [addingPlayer, setAddingPlayer] = useState(null) // player being added
  const [dropPlayerId, setDropPlayerId] = useState('') // chosen drop

  const { data: players, isLoading } = useAvailablePlayers(
    league.id,
    searchQuery || undefined,
    posFilter !== 'All' ? posFilter : undefined
  )
  const { data: roster } = useFantasyRoster(league.id)
  const addDrop = useAddDropPlayer(league.id)
  const isDraftPhase = league.status === 'open' || league.status === 'active' && !roster?.length

  async function handleConfirmAdd() {
    if (!addingPlayer) return
    if ((roster?.length || 0) >= 16 && !dropPlayerId) {
      toast('Pick a player to drop', 'error')
      return
    }
    try {
      await addDrop.mutateAsync({
        addPlayerId: addingPlayer.id,
        dropPlayerId: dropPlayerId || null,
      })
      toast(`${addingPlayer.full_name} added`, 'success')
      setAddingPlayer(null)
      setDropPlayerId('')
    } catch (err) {
      toast(err.message || 'Failed to add player', 'error')
    }
  }

  return (
    <div className="rounded-xl border border-text-primary/20 overflow-hidden">
      <div className="p-3 border-b border-border">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search players..."
          className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="flex gap-1 mt-2 overflow-x-auto">
          {POSITION_FILTERS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                posFilter === pos ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-sm text-text-muted py-8">Loading...</div>
        ) : (players || []).map((player) => (
          <div key={player.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
            {player.headshot_url && (
              <img
                src={player.headshot_url}
                alt=""
                className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-text-primary truncate">{player.full_name}</span>
                <InjuryBadge status={player.injury_status} />
              </div>
              <div className="text-xs text-text-muted">{player.position} · {player.team || 'FA'}</div>
            </div>
            {!isDraftPhase && roster?.length > 0 && (
              <button
                onClick={() => setAddingPlayer(player)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0"
              >
                + Add
              </button>
            )}
          </div>
        ))}
        {!isLoading && players?.length === 0 && (
          <div className="text-center text-sm text-text-muted py-8">No players found</div>
        )}
      </div>

      {/* Add/drop confirm modal */}
      {addingPlayer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={() => setAddingPlayer(null)}>
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg mb-4">Add {addingPlayer.full_name}</h3>
            {(roster?.length || 0) >= 16 && (
              <>
                <p className="text-sm text-text-secondary mb-3">Roster is full. Pick a player to drop:</p>
                <div className="space-y-1 mb-4 max-h-60 overflow-y-auto">
                  {(roster || []).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setDropPlayerId(r.player_id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                        dropPlayerId === r.player_id ? 'border-accent bg-accent/10' : 'border-border bg-bg-primary hover:bg-bg-card-hover'
                      }`}
                    >
                      {r.nfl_players?.headshot_url && (
                        <img src={r.nfl_players.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{r.nfl_players?.full_name}</div>
                        <div className="text-[10px] text-text-muted">{r.nfl_players?.position} · {r.slot.toUpperCase()}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setAddingPlayer(null); setDropPlayerId('') }} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors">Cancel</button>
              <button
                onClick={handleConfirmAdd}
                disabled={addDrop.isPending}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {addDrop.isPending ? 'Adding…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
