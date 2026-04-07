import { useState } from 'react'
import { useFantasyTrades, useRespondToTrade, useFantasyRoster, useProposeTrade } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'

function PlayerChip({ player }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-bg-primary border border-text-primary/10 px-2 py-1.5">
      {player?.headshot_url && (
        <img src={player.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
      )}
      <div className="min-w-0">
        <div className="text-xs font-semibold text-text-primary truncate">{player?.full_name}</div>
        <div className="text-[10px] text-text-muted">{player?.position} · {player?.team}</div>
      </div>
    </div>
  )
}

function TradeCard({ trade, currentUserId, onAccept, onDecline, onCancel }) {
  const isReceiver = trade.receiver_user_id === currentUserId
  const isProposer = trade.proposer_user_id === currentUserId
  const isPending = trade.status === 'pending'

  const proposerItems = (trade.fantasy_trade_items || []).filter((i) => i.from_user_id === trade.proposer_user_id)
  const receiverItems = (trade.fantasy_trade_items || []).filter((i) => i.from_user_id === trade.receiver_user_id)

  const statusColor = trade.status === 'accepted' ? 'text-correct'
    : trade.status === 'declined' || trade.status === 'cancelled' ? 'text-incorrect'
    : 'text-yellow-500'

  return (
    <div className="rounded-xl border border-text-primary/20 p-4 bg-bg-primary/40 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar user={trade.proposer} size="sm" />
          <span className="text-xs font-semibold truncate">{trade.proposer?.display_name || trade.proposer?.username}</span>
          <span className="text-text-muted text-xs">→</span>
          <Avatar user={trade.receiver} size="sm" />
          <span className="text-xs font-semibold truncate">{trade.receiver?.display_name || trade.receiver?.username}</span>
        </div>
        <span className={`text-[10px] uppercase font-bold ${statusColor}`}>{trade.status}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase text-text-muted mb-1">{trade.proposer?.display_name || 'Proposer'} sends</div>
          <div className="space-y-1">
            {proposerItems.map((item) => <PlayerChip key={item.id} player={item.nfl_players} />)}
            {!proposerItems.length && <div className="text-xs text-text-muted italic">Nothing</div>}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-text-muted mb-1">{trade.receiver?.display_name || 'Receiver'} sends</div>
          <div className="space-y-1">
            {receiverItems.map((item) => <PlayerChip key={item.id} player={item.nfl_players} />)}
            {!receiverItems.length && <div className="text-xs text-text-muted italic">Nothing</div>}
          </div>
        </div>
      </div>

      {trade.message && (
        <div className="mt-3 text-xs text-text-secondary italic">"{trade.message}"</div>
      )}

      {isPending && isReceiver && (
        <div className="flex gap-2 mt-3">
          <button onClick={() => onDecline(trade.id)} className="flex-1 py-2 rounded-lg text-xs font-semibold bg-bg-card text-text-secondary border border-border hover:bg-incorrect/20 hover:text-incorrect transition-colors">Decline</button>
          <button onClick={() => onAccept(trade.id)} className="flex-1 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors">Accept</button>
        </div>
      )}
      {isPending && isProposer && (
        <button onClick={() => onCancel(trade.id)} className="w-full mt-3 py-2 rounded-lg text-xs font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors">Cancel Proposal</button>
      )}
    </div>
  )
}

function ProposeTradeModal({ league, currentUserId, onClose }) {
  const { data: myRoster } = useFantasyRoster(league.id)
  const propose = useProposeTrade(league.id)

  // List of other league members (anyone except me)
  const otherMembers = (league.members || []).filter((m) => m.user_id !== currentUserId)
  const [receiverId, setReceiverId] = useState('')
  const [myPlayerIds, setMyPlayerIds] = useState([])
  const [theirPlayerIds, setTheirPlayerIds] = useState([])
  const [message, setMessage] = useState('')

  // Fetch the receiver's roster on demand
  const { data: theirRoster } = useQuery({
    queryKey: ['leagues', league.id, 'fantasy', 'roster', receiverId],
    queryFn: () => api.get(`/leagues/${league.id}/fantasy/roster/${receiverId}`),
    enabled: !!receiverId,
  })

  function toggle(arr, setter, id) {
    if (arr.includes(id)) setter(arr.filter((x) => x !== id))
    else setter([...arr, id])
  }

  async function handleSubmit() {
    if (!receiverId) {
      toast('Pick a trade partner', 'error')
      return
    }
    if (myPlayerIds.length === 0 && theirPlayerIds.length === 0) {
      toast('Add at least one player', 'error')
      return
    }
    try {
      await propose.mutateAsync({
        receiver_user_id: receiverId,
        proposer_player_ids: myPlayerIds,
        receiver_player_ids: theirPlayerIds,
        message: message.trim() || undefined,
      })
      toast('Trade proposed', 'success')
      onClose()
    } catch (err) {
      toast(err.message || 'Failed to propose trade', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-bg-secondary w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-bg-secondary border-b border-text-primary/10 px-4 py-3 flex items-center justify-between z-10">
          <h3 className="font-display text-lg">Propose Trade</h3>
          <button onClick={onClose} className="text-text-muted p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Trading partner */}
          <div>
            <label className="block text-xs uppercase text-text-muted mb-2">Trade with</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {otherMembers.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => { setReceiverId(m.user_id); setTheirPlayerIds([]) }}
                  className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    receiverId === m.user_id ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:bg-bg-card-hover'
                  }`}
                >
                  <Avatar user={m.user || m} size="xs" />
                  <span className="text-xs font-semibold truncate">{m.user?.display_name || m.user?.username || m.username}</span>
                </button>
              ))}
            </div>
          </div>

          {receiverId && (
            <div className="grid grid-cols-2 gap-3">
              {/* My side */}
              <div>
                <div className="text-[10px] uppercase text-text-muted mb-1.5">You give ({myPlayerIds.length})</div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {(myRoster || []).map((r) => {
                    const selected = myPlayerIds.includes(r.player_id)
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggle(myPlayerIds, setMyPlayerIds, r.player_id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${
                          selected ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:bg-bg-card-hover'
                        }`}
                      >
                        {r.nfl_players?.headshot_url && (
                          <img src={r.nfl_players.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate">{r.nfl_players?.full_name}</div>
                          <div className="text-[10px] text-text-muted">{r.nfl_players?.position} · {r.nfl_players?.team}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Their side */}
              <div>
                <div className="text-[10px] uppercase text-text-muted mb-1.5">You get ({theirPlayerIds.length})</div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {(theirRoster || []).map((r) => {
                    const selected = theirPlayerIds.includes(r.player_id)
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggle(theirPlayerIds, setTheirPlayerIds, r.player_id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${
                          selected ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:bg-bg-card-hover'
                        }`}
                      >
                        {r.nfl_players?.headshot_url && (
                          <img src={r.nfl_players.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate">{r.nfl_players?.full_name}</div>
                          <div className="text-[10px] text-text-muted">{r.nfl_players?.position} · {r.nfl_players?.team}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {receiverId && (
            <div>
              <label className="block text-xs uppercase text-text-muted mb-1.5">Optional message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Pitch your trade…"
                rows={2}
                maxLength={280}
                className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={propose.isPending || !receiverId}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {propose.isPending ? 'Proposing…' : 'Propose Trade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FantasyTrades({ league }) {
  const { profile } = useAuth()
  const { data: trades, isLoading } = useFantasyTrades(league.id)
  const respond = useRespondToTrade(league.id)
  const [showProposeModal, setShowProposeModal] = useState(false)

  if (isLoading) return <LoadingSpinner />

  const pending = (trades || []).filter((t) => t.status === 'pending')
  const completed = (trades || []).filter((t) => t.status !== 'pending')

  async function handleAction(tradeId, action) {
    try {
      await respond.mutateAsync({ tradeId, action })
      toast(`Trade ${action}ed`, 'success')
    } catch (err) {
      toast(err.message || `Failed to ${action} trade`, 'error')
    }
  }

  if (!trades?.length) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setShowProposeModal(true)}
          className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent-hover transition-colors"
        >
          + Propose Trade
        </button>
        <div className="text-center py-8">
          <p className="text-sm text-text-secondary mb-2">No trades yet.</p>
          <p className="text-xs text-text-muted">Propose a trade with another league member.</p>
        </div>
        {showProposeModal && (
          <ProposeTradeModal league={league} currentUserId={profile?.id} onClose={() => setShowProposeModal(false)} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowProposeModal(true)}
        className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent-hover transition-colors"
      >
        + Propose Trade
      </button>
      {showProposeModal && (
        <ProposeTradeModal league={league} currentUserId={profile?.id} onClose={() => setShowProposeModal(false)} />
      )}
      {pending.length > 0 && (
        <div>
          <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">Pending</h3>
          <div className="space-y-3">
            {pending.map((t) => (
              <TradeCard
                key={t.id}
                trade={t}
                currentUserId={profile?.id}
                onAccept={(id) => handleAction(id, 'accept')}
                onDecline={(id) => handleAction(id, 'decline')}
                onCancel={(id) => handleAction(id, 'cancel')}
              />
            ))}
          </div>
        </div>
      )}
      {completed.length > 0 && (
        <div>
          <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">History</h3>
          <div className="space-y-3">
            {completed.map((t) => (
              <TradeCard key={t.id} trade={t} currentUserId={profile?.id} onAccept={() => {}} onDecline={() => {}} onCancel={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
