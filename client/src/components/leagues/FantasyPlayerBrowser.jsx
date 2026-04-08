import { useState } from 'react'
import {
  useAvailablePlayers, useFantasyRoster, useAddDropPlayer,
  useFantasySettings, useWaiverState, useMyWaiverClaims, useSubmitWaiverClaim, useCancelWaiverClaim,
} from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import PlayerDetailModal from './PlayerDetailModal'

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
  const [bidAmount, setBidAmount] = useState(0)
  const [detailPlayerId, setDetailPlayerId] = useState(null)

  const { data: players, isLoading } = useAvailablePlayers(
    league.id,
    searchQuery || undefined,
    posFilter !== 'All' ? posFilter : undefined
  )
  const { data: roster } = useFantasyRoster(league.id)
  const { data: settings } = useFantasySettings(league.id)
  const { data: waiverData } = useWaiverState(league.id)
  const { data: myClaims } = useMyWaiverClaims(league.id)
  const addDrop = useAddDropPlayer(league.id)
  const submitClaim = useSubmitWaiverClaim(league.id)
  const cancelClaim = useCancelWaiverClaim(league.id)
  const isDraftPhase = league.status === 'open' || (league.status === 'active' && !roster?.length)
  const isFaab = settings?.waiver_type === 'faab'
  const isWaiver = settings?.waiver_type === 'priority' || settings?.waiver_type === 'rolling' || isFaab
  const myWaiverState = waiverData?.me
  const pendingClaims = (myClaims || []).filter((c) => c.status === 'pending')

  // Total roster capacity from settings (starters + bench, IR slots are excluded
  // because IR'd players don't count toward the active roster)
  const rosterCap = (() => {
    const slots = settings?.roster_slots
    if (!slots) return 16
    let n = 0
    for (const [k, v] of Object.entries(slots)) {
      if (k === 'ir') continue
      n += Number(v) || 0
    }
    return n || 16
  })()
  // Active (non-IR) rostered count
  const activeRosterCount = (roster || []).filter((r) => r.slot !== 'ir').length

  async function handleConfirmAdd() {
    if (!addingPlayer) return
    if (activeRosterCount >= rosterCap && !dropPlayerId) {
      toast('Pick a player to drop', 'error')
      return
    }
    try {
      if (isWaiver) {
        await submitClaim.mutateAsync({
          add_player_id: addingPlayer.id,
          drop_player_id: dropPlayerId || null,
          bid_amount: isFaab ? Number(bidAmount) || 0 : 0,
        })
        toast(`Waiver claim submitted for ${addingPlayer.full_name}`, 'success')
      } else {
        await addDrop.mutateAsync({
          addPlayerId: addingPlayer.id,
          dropPlayerId: dropPlayerId || null,
        })
        toast(`${addingPlayer.full_name} added`, 'success')
      }
      setAddingPlayer(null)
      setDropPlayerId('')
      setBidAmount(0)
    } catch (err) {
      toast(err.message || 'Failed to submit claim', 'error')
    }
  }

  return (
    <div className="space-y-3">
      {/* Waiver state summary */}
      {isWaiver && !isDraftPhase && myWaiverState && (
        <div className="rounded-xl border border-text-primary/20 px-4 py-3 bg-bg-primary/40 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase text-text-muted">Priority</div>
              <div className="text-sm font-bold text-text-primary">#{myWaiverState.priority}</div>
            </div>
            {isFaab && (
              <div>
                <div className="text-[10px] uppercase text-text-muted">FAAB</div>
                <div className="text-sm font-bold text-accent">${myWaiverState.faab_remaining}</div>
              </div>
            )}
          </div>
          <span className="text-[10px] text-text-muted text-right">Waivers process Wed 3 AM ET</span>
        </div>
      )}

      {/* Pending claims */}
      {pendingClaims.length > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-2 border-b border-border">
            <h4 className="text-xs text-text-muted uppercase tracking-wider">Your Pending Claims</h4>
          </div>
          <div className="divide-y divide-border">
            {pendingClaims.map((claim) => (
              <div key={claim.id} className="flex items-center gap-3 px-4 py-2">
                {claim.add_player?.headshot_url && (
                  <img src={claim.add_player.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">+ {claim.add_player?.full_name}</div>
                  <div className="text-[10px] text-text-muted">
                    {claim.drop_player ? `Drop ${claim.drop_player.full_name}` : 'No drop'}
                    {isFaab && ` · $${claim.bid_amount}`}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await cancelClaim.mutateAsync(claim.id)
                      toast('Claim cancelled', 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to cancel', 'error')
                    }
                  }}
                  className="text-[10px] font-semibold text-incorrect hover:text-incorrect/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setDetailPlayerId(player.id)}
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailPlayerId(player.id)}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-text-primary truncate hover:text-accent transition-colors">{player.full_name}</span>
                <InjuryBadge status={player.injury_status} />
              </div>
              <div className="text-xs text-text-muted">{player.position} · {player.team || 'FA'}</div>
            </div>
            {!isDraftPhase && roster?.length > 0 && (
              <button
                onClick={() => setAddingPlayer(player)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0"
              >
                {isWaiver ? '+ Claim' : '+ Add'}
              </button>
            )}
          </div>
        ))}
        {!isLoading && players?.length === 0 && (
          <div className="text-center text-sm text-text-muted py-8">No players found</div>
        )}
      </div>

    </div>

      {/* Add/drop confirm modal */}
      {addingPlayer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={() => { setAddingPlayer(null); setBidAmount(0) }}>
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg mb-4">{isWaiver ? 'Claim' : 'Add'} {addingPlayer.full_name}</h3>
            {isFaab && (
              <div className="mb-4">
                <label className="block text-xs uppercase text-text-muted mb-1.5">FAAB Bid (you have ${myWaiverState?.faab_remaining ?? 0})</label>
                <input
                  type="number"
                  min={0}
                  max={myWaiverState?.faab_remaining ?? 100}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            )}
            {activeRosterCount >= rosterCap && (
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
              <button onClick={() => { setAddingPlayer(null); setDropPlayerId(''); setBidAmount(0) }} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors">Cancel</button>
              <button
                onClick={handleConfirmAdd}
                disabled={addDrop.isPending || submitClaim.isPending}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {(addDrop.isPending || submitClaim.isPending) ? 'Submitting…' : isWaiver ? 'Submit Claim' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailPlayerId && (
        <PlayerDetailModal leagueId={league.id} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}
    </div>
  )
}
