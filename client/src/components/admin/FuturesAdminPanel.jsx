import { useState, useMemo, useEffect, useRef } from 'react'
import { useSyncFutures, useAdminFuturesMarkets, useCloseFuturesMarket, useSettleFuturesMarket, useCreateFuturesMarket } from '../../hooks/useAdmin'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'
import { formatOdds } from '../../lib/scoring'
import { api } from '../../lib/api'

const sportTabs = [
  { label: 'All', key: '' },
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
  { label: 'NHL', key: 'icehockey_nhl' },
]

export default function FuturesAdminPanel() {
  const [sportFilter, setSportFilter] = useState('')
  const [settlingId, setSettlingId] = useState(null)
  const [winnerInput, setWinnerInput] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newSport, setNewSport] = useState('basketball_nba')
  const [newTitle, setNewTitle] = useState('')
  const [newOutcomes, setNewOutcomes] = useState([{ name: '', odds: '' }])
  const [teamSuggestions, setTeamSuggestions] = useState([])
  const [focusedOutcome, setFocusedOutcome] = useState(null)

  // Fetch teams for autocomplete when sport changes
  useEffect(() => {
    if (!showCreate) return
    api.get(`/teams?sport=${newSport}`).then(setTeamSuggestions).catch(() => setTeamSuggestions([]))
  }, [newSport, showCreate])

  const { data: markets, isLoading } = useAdminFuturesMarkets(sportFilter || undefined)
  const syncFutures = useSyncFutures()
  const closeMarket = useCloseFuturesMarket()
  const settleMarket = useSettleFuturesMarket()
  const createMarket = useCreateFuturesMarket()

  async function handleCreate() {
    const outcomes = newOutcomes.filter((o) => o.name.trim()).map((o) => ({
      name: o.name.trim(),
      odds: parseInt(o.odds) || 100,
    }))
    if (!newTitle.trim() || outcomes.length < 2) {
      toast('Need a title and at least 2 outcomes', 'error')
      return
    }
    try {
      await createMarket.mutateAsync({ sport_key: newSport, title: newTitle.trim(), outcomes })
      toast('Custom market created!', 'success')
      setShowCreate(false)
      setNewTitle('')
      setNewOutcomes([{ name: '', odds: '' }])
    } catch (err) {
      toast(err.message || 'Failed to create market', 'error')
    }
  }

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
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-correct hover:bg-correct/90 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          {showCreate ? 'Cancel' : '+ Custom Market'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-4 mb-4 space-y-3">
          <h3 className="font-display text-sm">Create Custom Futures Market</h3>
          <div className="flex gap-2">
            <select
              value={newSport}
              onChange={(e) => setNewSport(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
            >
              {sportTabs.filter((t) => t.key).map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. NBA Eastern Conference Winner"
              className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted">Outcomes (name + American odds)</label>
            {newOutcomes.map((o, i) => {
              const query = o.name.toLowerCase()
              const filtered = focusedOutcome === i && query.length >= 1
                ? teamSuggestions.filter((t) => t.toLowerCase().includes(query)).slice(0, 8)
                : []
              return (
              <div key={i} className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={o.name}
                    onChange={(e) => {
                      const updated = [...newOutcomes]
                      updated[i].name = e.target.value
                      setNewOutcomes(updated)
                    }}
                    onFocus={() => setFocusedOutcome(i)}
                    onBlur={() => setTimeout(() => setFocusedOutcome(null), 150)}
                    placeholder="e.g. Boston Celtics"
                    className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted"
                  />
                  {filtered.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filtered.map((team) => (
                        <button
                          key={team}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            const updated = [...newOutcomes]
                            updated[i].name = team
                            setNewOutcomes(updated)
                            setFocusedOutcome(null)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-accent/10 transition-colors"
                        >
                          {team}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  value={o.odds}
                  onChange={(e) => {
                    const updated = [...newOutcomes]
                    updated[i].odds = e.target.value
                    setNewOutcomes(updated)
                  }}
                  placeholder="+150"
                  className="w-24 bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted"
                />
                {newOutcomes.length > 1 && (
                  <button
                    onClick={() => setNewOutcomes(newOutcomes.filter((_, j) => j !== i))}
                    className="text-text-muted hover:text-incorrect text-lg"
                  >&times;</button>
                )}
              </div>)
            })}
            <button
              onClick={() => setNewOutcomes([...newOutcomes, { name: '', odds: '' }])}
              className="text-xs text-accent hover:text-accent-hover"
            >
              + Add outcome
            </button>
          </div>
          <button
            onClick={handleCreate}
            disabled={createMarket.isPending}
            className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {createMarket.isPending ? 'Creating...' : 'Create Market'}
          </button>
        </div>
      )}

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
