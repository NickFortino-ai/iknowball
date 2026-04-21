import { useState } from 'react'
import { useFantasyTrades, useRespondToTrade, useFantasyRoster, useProposeTrade, useFantasyTransactions } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import LoadingSpinner from '../ui/LoadingSpinner'
import { SkeletonCard } from '../ui/Skeleton'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'

function PlayerChip({ player }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-bg-primary border border-text-primary/10 px-3 py-2">
      {player?.headshot_url && (
        <img src={player.headshot_url} alt="" className="w-9 h-9 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
      )}
      <div className="min-w-0">
        <div className="text-sm font-bold text-text-primary truncate">{player?.full_name}</div>
        <div className="text-xs text-text-primary">{player?.position} · {player?.team}</div>
      </div>
    </div>
  )
}

function TradeCard({ trade, currentUserId, isCommissioner, onAccept, onDecline, onCancel, onApprove, onVeto }) {
  const isReceiver = trade.receiver_user_id === currentUserId
  const isProposer = trade.proposer_user_id === currentUserId
  const isPending = trade.status === 'pending'
  const isPendingReview = trade.status === 'pending_review'

  const proposerItems = (trade.fantasy_trade_items || []).filter((i) => i.from_user_id === trade.proposer_user_id)
  const receiverItems = (trade.fantasy_trade_items || []).filter((i) => i.from_user_id === trade.receiver_user_id)

  const statusColors = {
    pending: 'text-yellow-500 bg-yellow-500/10',
    pending_review: 'text-accent bg-accent/10',
    accepted: 'text-correct bg-correct/10',
    declined: 'text-incorrect bg-incorrect/10',
    cancelled: 'text-text-muted bg-text-primary/5',
    vetoed: 'text-incorrect bg-incorrect/10',
  }

  const statusLabels = {
    pending_review: 'awaiting approval',
  }

  return (
    <div className={`rounded-xl border border-text-primary/20 p-4 bg-bg-primary`}>
      <div className="flex items-center gap-3 mb-3">
        <Avatar user={trade.proposer} size="sm" />
        <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4-4 4M3 12h18" />
        </svg>
        <Avatar user={trade.receiver} size="sm" />
        <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded ${statusColors[trade.status] || ''}`}>
          {statusLabels[trade.status] || trade.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-sm font-semibold text-text-primary mb-1.5">{trade.proposer?.display_name || 'Proposer'} sends</div>
          <div className="space-y-1">{proposerItems.map((i) => <PlayerChip key={i.player_id} player={i.nfl_players} />)}</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-text-primary mb-1.5">{trade.receiver?.display_name || 'Receiver'} sends</div>
          <div className="space-y-1">{receiverItems.map((i) => <PlayerChip key={i.player_id} player={i.nfl_players} />)}</div>
        </div>
      </div>

      {trade.message && <div className="text-sm text-text-primary italic mt-3">"{trade.message}"</div>}

      {isPending && isReceiver && (
        <div className="flex gap-3 mt-3">
          <button onClick={() => onAccept(trade.id)} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-correct text-white">Accept</button>
          <button onClick={() => onDecline(trade.id)} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-incorrect text-white">Decline</button>
        </div>
      )}
      {isPending && isProposer && (
        <button onClick={() => onCancel(trade.id)} className="w-full mt-3 py-2 rounded-lg text-xs font-semibold text-text-muted border border-text-primary/20 hover:bg-text-primary/5">Cancel</button>
      )}
      {isPendingReview && isCommissioner && (
        <div className="flex gap-3 mt-3">
          <button onClick={() => onApprove?.(trade.id)} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-correct text-white">Approve</button>
          <button onClick={() => onVeto?.(trade.id)} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-incorrect text-white">Veto</button>
        </div>
      )}
      {isPending && isCommissioner && !isReceiver && !isProposer && (
        <button onClick={() => onVeto?.(trade.id)} className="w-full mt-3 py-2 rounded-lg text-xs font-semibold text-incorrect border border-incorrect/30 hover:bg-incorrect/10">Veto</button>
      )}
    </div>
  )
}

// =====================================================================
// Transaction Log Item
// =====================================================================

function formatTimeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function TransactionRow({ txn }) {
  const player = txn.nfl_players || {}
  const user = txn.users || {}

  const typeConfig = {
    add: { icon: '+', color: 'text-correct', label: 'added' },
    drop: { icon: '-', color: 'text-incorrect', label: 'dropped' },
    waiver_add: { icon: '+', color: 'text-correct', label: 'claimed (waiver)' },
    waiver_drop: { icon: '-', color: 'text-incorrect', label: 'dropped' },
    draft: { icon: '\u2605', color: 'text-text-primary', label: 'drafted' },
  }
  const cfg = typeConfig[txn.type] || { icon: '?', color: 'text-text-muted', label: txn.type }

  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-text-primary/10 last:border-0">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${cfg.color} bg-text-primary/10`}>
        {cfg.icon}
      </span>
      {player.headshot_url ? (
        <img src={player.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
      ) : (
        <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-base text-text-primary">
          <span className="font-semibold">{user.display_name || user.username}</span>
          {' '}<span className="text-text-primary/60">{cfg.label}</span>{' '}
          <span className="font-semibold">{player.full_name}</span>
        </div>
        <div className="text-xs text-text-muted">
          {player.position} · {player.team || 'FA'}
          {txn.bid_amount > 0 && <span> · ${txn.bid_amount} FAAB</span>}
          {' · '}{formatTimeAgo(txn.created_at)}
        </div>
      </div>
    </div>
  )
}

function TradeTransactionRow({ items, timestamp }) {
  // Group by direction: sends and receives per user
  const sends = items.filter((t) => t.type === 'trade_send')
  const receives = items.filter((t) => t.type === 'trade_receive')

  // Build readable trade description: each user and what they acquired
  // Group receives by user
  const byReceiver = {}
  for (const r of receives) {
    const name = r.users?.display_name || r.users?.username || 'Unknown'
    if (!byReceiver[name]) byReceiver[name] = []
    byReceiver[name].push(r.nfl_players?.full_name || 'a player')
  }

  const parts = Object.entries(byReceiver).map(([name, players]) =>
    `${name} acquires ${players.join(' and ')}`
  )

  return (
    <div className="py-3.5 border-b border-text-primary/10 last:border-0">
      <div className="flex items-center gap-3">
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-accent bg-text-primary/10">
          {'\u21C4'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-accent uppercase tracking-wide mb-0.5">Trade Approved</div>
          <div className="text-sm text-text-primary">{parts.join('; ')}</div>
          <div className="text-[10px] text-text-muted mt-0.5">{formatTimeAgo(timestamp)}</div>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Propose Trade Modal (exported for reuse from RosterModal)
// =====================================================================

export function ProposeTradeModal({ league, currentUserId, onClose, initialReceiverId, initialAcquirePlayerId }) {
  const { data: myRoster } = useFantasyRoster(league.id)
  const propose = useProposeTrade(league.id)

  const otherMembers = (league.members || []).filter((m) => m.user_id !== currentUserId)
  const [receiverId, setReceiverId] = useState(initialReceiverId || '')
  const [myPlayerIds, setMyPlayerIds] = useState([])
  const [theirPlayerIds, setTheirPlayerIds] = useState(initialAcquirePlayerId ? [initialAcquirePlayerId] : [])
  const [message, setMessage] = useState('')

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
    if (!receiverId) { toast('Pick a trade partner', 'error'); return }
    if (myPlayerIds.length === 0 && theirPlayerIds.length === 0) { toast('Add at least one player', 'error'); return }
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
      <div className="bg-bg-primary border border-text-primary/20 w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-bg-primary border-b border-text-primary/10 px-4 py-3 flex items-center justify-between z-10">
          <h3 className="font-display text-lg">Propose Trade</h3>
          <button onClick={onClose} className="text-text-muted p-1">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs uppercase text-text-muted mb-2">Trade with</label>
            <div className="grid grid-cols-3 gap-2">
              {otherMembers.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => { setReceiverId(m.user_id); setTheirPlayerIds([]) }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                    receiverId === m.user_id ? 'border-accent bg-accent/10' : 'border-text-primary/20 bg-bg-primary hover:bg-bg-card-hover'
                  }`}
                >
                  <Avatar user={m.users || m} size="sm" />
                  <span className="text-sm font-semibold truncate">{m.users?.display_name || m.users?.username || m.username}</span>
                </button>
              ))}
            </div>
          </div>

          {receiverId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase text-text-muted mb-1.5">You give ({myPlayerIds.length})</div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {(myRoster || []).map((r) => {
                    const selected = myPlayerIds.includes(r.player_id)
                    return (
                      <button key={r.id} type="button" onClick={() => toggle(myPlayerIds, setMyPlayerIds, r.player_id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${selected ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:bg-bg-card-hover'}`}>
                        {r.nfl_players?.headshot_url && <img src={r.nfl_players.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate">{r.nfl_players?.full_name}</div>
                          <div className="text-[10px] text-text-muted">{r.nfl_players?.position} · {r.nfl_players?.team}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-text-muted mb-1.5">You get ({theirPlayerIds.length})</div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {(theirRoster || []).map((r) => {
                    const selected = theirPlayerIds.includes(r.player_id)
                    return (
                      <button key={r.id} type="button" onClick={() => toggle(theirPlayerIds, setTheirPlayerIds, r.player_id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${selected ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:bg-bg-card-hover'}`}>
                        {r.nfl_players?.headshot_url && <img src={r.nfl_players.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />}
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
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Pitch your trade…" rows={2} maxLength={280}
                className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none" />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary border border-border">Cancel</button>
            <button onClick={handleSubmit} disabled={propose.isPending || !receiverId}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white disabled:opacity-50">
              {propose.isPending ? 'Proposing…' : 'Propose Trade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Main Transactions Component
// =====================================================================

export default function FantasyTrades({ league }) {
  const { profile } = useAuth()
  const { data: trades, isLoading: tradesLoading } = useFantasyTrades(league.id)
  const { data: transactions, isLoading: txnLoading } = useFantasyTransactions(league.id)
  const respond = useRespondToTrade(league.id)
  const [showProposeModal, setShowProposeModal] = useState(false)
  const [activeView, setActiveView] = useState('activity') // 'activity' | 'trades'

  const isLoading = tradesLoading || txnLoading

  const isCommissioner = league.commissioner_id === profile?.id
  const pending = (trades || []).filter((t) => t.status === 'pending' || t.status === 'pending_review')

  async function handleAction(tradeId, action) {
    try {
      await respond.mutateAsync({ tradeId, action })
      toast(`Trade ${action}ed`, 'success')
    } catch (err) {
      toast(err.message || `Failed to ${action} trade`, 'error')
    }
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs: Activity | Trades | + Propose Trade */}
      <div className="flex gap-1 items-center">
        {['activity', 'trades'].map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeView === v ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {v === 'activity' ? 'Activity' : `Trades${pending.length ? ` (${pending.length})` : ''}`}
          </button>
        ))}
        <button
          onClick={() => setShowProposeModal(true)}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          + Propose Trade
        </button>
      </div>
      {showProposeModal && (
        <ProposeTradeModal league={league} currentUserId={profile?.id} onClose={() => setShowProposeModal(false)} />
      )}

      {isLoading ? (
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
      ) : activeView === 'activity' ? (
        /* Activity log */
        <div className="rounded-xl border border-text-primary/20 bg-bg-primary/60 overflow-hidden">
          {!transactions?.length ? (
            <div className="text-center py-8 text-sm text-text-muted">No transactions yet.</div>
          ) : (
            <div className="px-4">
              {(() => {
                // Group trade_send/trade_receive by trade_id into single entries
                const rendered = new Set()
                const items = []
                for (const txn of transactions) {
                  if ((txn.type === 'trade_send' || txn.type === 'trade_receive') && txn.trade_id) {
                    if (rendered.has(txn.trade_id)) continue
                    rendered.add(txn.trade_id)
                    const tradeItems = transactions.filter((t) => t.trade_id === txn.trade_id)
                    items.push(
                      <TradeTransactionRow key={`trade-${txn.trade_id}`} items={tradeItems} timestamp={txn.created_at} />
                    )
                  } else {
                    items.push(<TransactionRow key={txn.id} txn={txn} />)
                  }
                }
                return items
              })()}
            </div>
          )}
        </div>
      ) : (
        /* Trades view */
        <div className="space-y-3">
          {pending.length > 0 && (
            <div>
              <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">Pending</h3>
              <div className="space-y-3">
                {pending.map((t) => (
                  <TradeCard key={t.id} trade={t} currentUserId={profile?.id} isCommissioner={isCommissioner}
                    onAccept={(id) => handleAction(id, 'accept')}
                    onDecline={(id) => handleAction(id, 'decline')}
                    onCancel={(id) => handleAction(id, 'cancel')}
                    onApprove={(id) => handleAction(id, 'approve')}
                    onVeto={(id) => handleAction(id, 'veto')} />
                ))}
              </div>
            </div>
          )}
          {(trades || []).filter((t) => t.status !== 'pending' && t.status !== 'pending_review').length > 0 && (
            <div>
              <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">History</h3>
              <div className="space-y-3">
                {(trades || []).filter((t) => t.status !== 'pending' && t.status !== 'pending_review').map((t) => (
                  <TradeCard key={t.id} trade={t} currentUserId={profile?.id} isCommissioner={isCommissioner} onAccept={() => {}} onDecline={() => {}} onCancel={() => {}} />
                ))}
              </div>
            </div>
          )}
          {!(trades || []).length && (
            <div className="text-center py-8 text-sm text-text-muted">No trades yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
