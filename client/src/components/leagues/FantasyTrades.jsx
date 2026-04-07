import { useState } from 'react'
import { useFantasyTrades, useRespondToTrade, useFantasyRoster, useProposeTrade } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
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

export default function FantasyTrades({ league }) {
  const { profile } = useAuth()
  const { data: trades, isLoading } = useFantasyTrades(league.id)
  const respond = useRespondToTrade(league.id)

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
      <div className="text-center py-8">
        <p className="text-sm text-text-secondary mb-2">No trades yet.</p>
        <p className="text-xs text-text-muted">Propose a trade from another manager's roster.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
