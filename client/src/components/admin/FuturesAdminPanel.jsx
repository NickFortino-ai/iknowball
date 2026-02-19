import { useState, useMemo } from 'react'
import { useSyncFutures, useAdminFuturesMarkets, useCloseFuturesMarket, useSettleFuturesMarket } from '../../hooks/useAdmin'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'
import { formatOdds } from '../../lib/scoring'

const sportTabs = [
  { label: 'All', key: '' },
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

export default function FuturesAdminPanel() {
  const [sportFilter, setSportFilter] = useState('')
  const [settlingId, setSettlingId] = useState(null)
  const [winnerInput, setWinnerInput] = useState('')

  const { data: markets, isLoading } = useAdminFuturesMarkets(sportFilter || undefined)
  const syncFutures = useSyncFutures()
  const closeMarket = useCloseFuturesMarket()
  const settleMarket = useSettleFuturesMarket()

  const grouped = useMemo(() => {
    if (!markets) return { active: [], closed: [], settled: [] }
    return {
      active: markets.filter((m) => m.status === 'active'),
      closed: markets.filter((m) => m.status === 'closed'),
      settled: markets.filter((m) => m.status === 'settled'),
    }
  }, [markets])

  async function handleSync() {
    try {
      const result = await syncFutures.mutateAsync()
      toast(`Synced ${result.synced} futures markets`, 'success')
    } catch (err) {
      toast(err.message || 'Sync failed', 'error')
    }
  }

  async function handleClose(marketId) {
    if (!confirm('Close this market? No new picks will be accepted.')) return
    try {
      await closeMarket.mutateAsync(marketId)
      toast('Market closed', 'success')
    } catch (err) {
      toast(err.message || 'Failed to close market', 'error')
    }
  }

  async function handleSettle(marketId) {
    if (!winnerInput.trim()) {
      toast('Select a winning outcome', 'error')
      return
    }
    if (!confirm(`Settle with winner: "${winnerInput}"?`)) return
    try {
      const result = await settleMarket.mutateAsync({ marketId, winningOutcome: winnerInput })
      toast(`Settled — scored ${result.scored} picks`, 'success')
      setSettlingId(null)
      setWinnerInput('')
    } catch (err) {
      toast(err.message || 'Settlement failed', 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleSync}
          disabled={syncFutures.isPending}
          className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {syncFutures.isPending ? 'Syncing...' : 'Sync All Futures'}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {sportTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSportFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sportFilter === tab.key
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !markets?.length ? (
        <p className="text-text-muted text-sm text-center py-8">No futures markets found. Try syncing first.</p>
      ) : (
        <div className="space-y-6">
          {/* Active Markets */}
          {grouped.active.length > 0 && (
            <div>
              <h3 className="font-display text-sm text-correct uppercase tracking-wider mb-2">Active ({grouped.active.length})</h3>
              <div className="space-y-2">
                {grouped.active.map((market) => (
                  <MarketRow
                    key={market.id}
                    market={market}
                    actions={
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSettlingId(market.id)
                            setWinnerInput('')
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                        >
                          Settle
                        </button>
                        <button
                          onClick={() => handleClose(market.id)}
                          disabled={closeMarket.isPending}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-text-muted/20 text-text-muted hover:bg-text-muted/30 transition-colors disabled:opacity-50"
                        >
                          Close
                        </button>
                      </div>
                    }
                    settleUI={settlingId === market.id && (
                      <SettleUI
                        market={market}
                        winnerInput={winnerInput}
                        setWinnerInput={setWinnerInput}
                        onSettle={() => handleSettle(market.id)}
                        onCancel={() => setSettlingId(null)}
                        isPending={settleMarket.isPending}
                      />
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Closed Markets */}
          {grouped.closed.length > 0 && (
            <div>
              <h3 className="font-display text-sm text-accent uppercase tracking-wider mb-2">Closed ({grouped.closed.length})</h3>
              <div className="space-y-2">
                {grouped.closed.map((market) => (
                  <MarketRow
                    key={market.id}
                    market={market}
                    actions={
                      <button
                        onClick={() => {
                          setSettlingId(market.id)
                          setWinnerInput('')
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                      >
                        Settle
                      </button>
                    }
                    settleUI={settlingId === market.id && (
                      <SettleUI
                        market={market}
                        winnerInput={winnerInput}
                        setWinnerInput={setWinnerInput}
                        onSettle={() => handleSettle(market.id)}
                        onCancel={() => setSettlingId(null)}
                        isPending={settleMarket.isPending}
                      />
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Settled Markets */}
          {grouped.settled.length > 0 && (
            <div>
              <h3 className="font-display text-sm text-text-muted uppercase tracking-wider mb-2">Settled ({grouped.settled.length})</h3>
              <div className="space-y-2">
                {grouped.settled.map((market) => (
                  <MarketRow
                    key={market.id}
                    market={market}
                    actions={
                      <span className="text-xs text-text-muted">
                        Winner: <span className="font-semibold text-correct">{market.winning_outcome}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MarketRow({ market, actions, settleUI }) {
  const outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || []
  const synced = market.last_synced_at
    ? new Date(market.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never'

  return (
    <div className="bg-bg-card rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{market.title}</div>
          <div className="text-xs text-text-muted">
            {market.sport_key} &middot; {outcomes.length} outcomes &middot; Synced: {synced}
          </div>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
      {settleUI}
    </div>
  )
}

function SettleUI({ market, winnerInput, setWinnerInput, onSettle, onCancel, isPending }) {
  const outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || []

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-text-muted mb-2">Select the winning outcome:</p>
      <div className="flex flex-wrap gap-1.5 mb-3 max-h-48 overflow-y-auto">
        {outcomes.map((o) => (
          <button
            key={o.name}
            onClick={() => setWinnerInput(o.name)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              winnerInput === o.name
                ? 'bg-accent text-white border-accent'
                : 'bg-bg-primary text-text-secondary border-border hover:bg-bg-card-hover'
            }`}
          >
            {o.name} ({formatOdds(o.odds)})
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSettle}
          disabled={isPending || !winnerInput}
          className="bg-correct hover:bg-correct/90 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isPending ? 'Settling...' : 'Confirm Settlement'}
        </button>
        <button
          onClick={onCancel}
          className="bg-bg-card-hover text-text-secondary px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
