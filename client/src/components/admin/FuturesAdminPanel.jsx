import { useState, useMemo, useEffect, useRef } from 'react'
import { useSyncFutures, useAdminFuturesMarkets, useCloseFuturesMarket, useSettleFuturesMarket, useCreateFuturesMarket, useUpdateFuturesMarket, useResolveStatLeaderFuture } from '../../hooks/useAdmin'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'
import { formatOdds } from '../../lib/scoring'
import { api } from '../../lib/api'

const sportTabs = [
  { label: 'All', key: '' },
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'WNBA', key: 'basketball_wnba' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'UFL', key: 'americanfootball_ufl' },
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

  // Stat-leader auto-resolve state. Only meaningful when newSport is
  // an NFL key (only sport wired to the resolver in v1). When the
  // toggle is on, outcomes become player picks (name + player_id +
  // team + position) instead of freeform text.
  const [statLeaderMode, setStatLeaderMode] = useState(false)
  const [statCategory, setStatCategory] = useState('')
  const [statDirection, setStatDirection] = useState('max')
  const [closeAt, setCloseAt] = useState('')
  const [nflCategories, setNflCategories] = useState([])
  const isNflSport = newSport === 'americanfootball_nfl'

  // Fetch teams AND players in parallel for autocomplete. Merged so the
  // admin can type either a team name (championship markets) or a player
  // name (MVP / award markets) and get matching suggestions.
  useEffect(() => {
    if (!showCreate) return
    Promise.allSettled([
      api.get(`/teams?sport=${newSport}`),
      api.get(`/teams/players?sport=${newSport}`),
    ]).then(([teamsRes, playersRes]) => {
      const teams = teamsRes.status === 'fulfilled' ? teamsRes.value : []
      const players = playersRes.status === 'fulfilled' ? playersRes.value : []
      setTeamSuggestions([...new Set([...teams, ...players])])
    })
  }, [newSport, showCreate])

  // Load NFL stat categories once when NFL is selected + create panel
  // is open. Cheap enough to re-hit but no reason to.
  useEffect(() => {
    if (!showCreate || !isNflSport) return
    if (nflCategories.length) return
    api.get('/admin/futures/stat-categories?sport=nfl').then(setNflCategories).catch(() => {})
  }, [showCreate, isNflSport, nflCategories.length])

  // Switching away from NFL forces stat-leader mode off — the resolver
  // is NFL-only for v1. Handled in the sport select's onChange rather
  // than an effect to avoid a cascading render.
  function pickSport(sport) {
    setNewSport(sport)
    if (sport !== 'americanfootball_nfl') setStatLeaderMode(false)
  }

  const { data: markets, isLoading } = useAdminFuturesMarkets(sportFilter || undefined)
  const syncFutures = useSyncFutures()
  const closeMarket = useCloseFuturesMarket()
  const settleMarket = useSettleFuturesMarket()
  const createMarket = useCreateFuturesMarket()
  const updateMarket = useUpdateFuturesMarket()
  const resolveStatLeader = useResolveStatLeaderFuture()

  // Inline edit state — the row being edited and a draft of its outcomes/title.
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editOutcomes, setEditOutcomes] = useState([])

  function startEdit(market) {
    const outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || []
    setEditingId(market.id)
    setEditTitle(market.title)
    setEditOutcomes(outcomes.map((o) => ({ name: o.name, odds: String(o.odds) })))
    setSettlingId(null)
  }

  async function handleSaveEdit() {
    const outcomes = editOutcomes
      .filter((o) => o.name.trim())
      .map((o) => ({ name: o.name.trim(), odds: parseInt(o.odds) || 100 }))
    if (!editTitle.trim() || outcomes.length < 2) {
      toast('Need a title and at least 2 outcomes', 'error')
      return
    }
    try {
      await updateMarket.mutateAsync({ marketId: editingId, title: editTitle.trim(), outcomes })
      toast('Market updated', 'success')
      setEditingId(null)
    } catch (err) {
      toast(err.message || 'Failed to update', 'error')
    }
  }

  async function handleCreate() {
    // Stat-leader outcomes must carry player_id; manual outcomes are
    // freeform text. Odds still apply either way (used for scoring).
    const outcomes = newOutcomes.filter((o) => o.name.trim()).map((o) => {
      const base = { name: o.name.trim(), odds: parseInt(o.odds) || 100 }
      if (statLeaderMode && o.player_id) {
        return { ...base, player_id: o.player_id, position: o.position, team: o.team }
      }
      return base
    })
    if (!newTitle.trim() || outcomes.length < 2) {
      toast('Need a title and at least 2 outcomes', 'error')
      return
    }
    if (statLeaderMode) {
      if (!statCategory) return toast('Pick a stat category', 'error')
      if (outcomes.some((o) => !o.player_id)) return toast('Every outcome needs a player selected', 'error')
    }
    try {
      const payload = {
        sport_key: newSport,
        title: newTitle.trim(),
        outcomes,
        resolution_type: statLeaderMode ? 'stat_leader' : 'manual',
      }
      if (statLeaderMode) {
        payload.stat_category = statCategory
        payload.stat_direction = statDirection
        if (closeAt) payload.close_at = new Date(closeAt).toISOString()
      }
      await createMarket.mutateAsync(payload)
      toast('Custom market created!', 'success')
      setShowCreate(false)
      setNewTitle('')
      setNewOutcomes([{ name: '', odds: '' }])
      setStatLeaderMode(false)
      setStatCategory('')
      setCloseAt('')
    } catch (err) {
      toast(err.message || 'Failed to create market', 'error')
    }
  }

  async function handleResolveStatLeader(marketId) {
    if (!confirm('Auto-resolve now using current season stats?')) return
    try {
      const result = await resolveStatLeader.mutateAsync(marketId)
      toast(`Resolved — scored ${result.scored} picks`, 'success')
    } catch (err) {
      toast(err.message || 'Resolve failed', 'error')
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
              onChange={(e) => pickSport(e.target.value)}
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
          {isNflSport && (
            <div className="bg-bg-secondary/50 border border-border rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={statLeaderMode}
                  onChange={(e) => setStatLeaderMode(e.target.checked)}
                />
                Auto-resolve via stat leader (NFL only)
              </label>
              {statLeaderMode && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={statCategory}
                    onChange={(e) => setStatCategory(e.target.value)}
                    className="bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
                  >
                    <option value="">-- Stat category --</option>
                    {nflCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.label}</option>
                    ))}
                  </select>
                  <select
                    value={statDirection}
                    onChange={(e) => setStatDirection(e.target.value)}
                    className="bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
                  >
                    <option value="max">Most (leader wins)</option>
                    <option value="min">Fewest (min wins)</option>
                  </select>
                  <input
                    type="datetime-local"
                    value={closeAt}
                    onChange={(e) => setCloseAt(e.target.value)}
                    className="bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
                    title="Auto-resolve after this time (leave blank for admin-only)"
                  />
                </div>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted">
              {statLeaderMode ? 'Player candidates (search + odds)' : 'Outcomes (name + American odds)'}
            </label>
            {newOutcomes.map((o, i) => (
              statLeaderMode ? (
                <StatLeaderOutcomeRow
                  key={i}
                  outcome={o}
                  canRemove={newOutcomes.length > 1}
                  onChange={(next) => {
                    const updated = [...newOutcomes]
                    updated[i] = next
                    setNewOutcomes(updated)
                  }}
                  onRemove={() => setNewOutcomes(newOutcomes.filter((_, j) => j !== i))}
                />
              ) : (
                <ManualOutcomeRow
                  key={i}
                  outcome={o}
                  index={i}
                  focused={focusedOutcome === i}
                  suggestions={teamSuggestions}
                  canRemove={newOutcomes.length > 1}
                  onFocus={() => setFocusedOutcome(i)}
                  onBlur={() => setTimeout(() => setFocusedOutcome(null), 150)}
                  onChange={(next) => {
                    const updated = [...newOutcomes]
                    updated[i] = next
                    setNewOutcomes(updated)
                  }}
                  onRemove={() => setNewOutcomes(newOutcomes.filter((_, j) => j !== i))}
                />
              )
            ))}
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

      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4 scrollbar-hide">
        {sportTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSportFilter(tab.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
                        {market.resolution_type === 'stat_leader' && (
                          <button
                            onClick={() => handleResolveStatLeader(market.id)}
                            disabled={resolveStatLeader.isPending}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                            title="Auto-resolve via current season stats"
                          >
                            Resolve
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(market)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setSettlingId(market.id)
                            setEditingId(null)
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
                    editUI={editingId === market.id && (
                      <EditUI
                        editTitle={editTitle}
                        setEditTitle={setEditTitle}
                        editOutcomes={editOutcomes}
                        setEditOutcomes={setEditOutcomes}
                        onSave={handleSaveEdit}
                        onCancel={() => setEditingId(null)}
                        isPending={updateMarket.isPending}
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

function MarketRow({ market, actions, settleUI, editUI }) {
  const outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || []
  const synced = market.last_synced_at
    ? new Date(market.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never'

  const isStatLeader = market.resolution_type === 'stat_leader'
  return (
    <div className="bg-bg-card rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate flex items-center gap-2">
            {market.title}
            {isStatLeader && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                AUTO · {market.stat_category}
              </span>
            )}
          </div>
          <div className="text-xs text-text-muted">
            {market.sport_key} &middot; {outcomes.length} outcomes &middot; Synced: {synced}
          </div>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
      {settleUI}
      {editUI}
    </div>
  )
}

function EditUI({ editTitle, setEditTitle, editOutcomes, setEditOutcomes, onSave, onCancel, isPending }) {
  function updateOutcome(i, field, value) {
    setEditOutcomes((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value }
      return next
    })
  }
  function removeOutcome(i) {
    setEditOutcomes((prev) => prev.filter((_, idx) => idx !== i))
  }
  function addOutcome() {
    setEditOutcomes((prev) => [...prev, { name: '', odds: '' }])
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      <div>
        <label className="text-xs text-text-muted block mb-1">Title</label>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
        />
      </div>
      <div>
        <label className="text-xs text-text-muted block mb-1">Outcomes (name + American odds). Remove eliminated teams; tweak odds as the field narrows.</label>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {editOutcomes.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={o.name}
                onChange={(e) => updateOutcome(i, 'name', e.target.value)}
                placeholder="Outcome"
                className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
              />
              <input
                type="text"
                value={o.odds}
                onChange={(e) => updateOutcome(i, 'odds', e.target.value)}
                placeholder="+150"
                className="w-24 bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
              />
              <button
                type="button"
                onClick={() => removeOutcome(i)}
                className="px-2 py-1 rounded-lg text-xs bg-incorrect/20 text-incorrect hover:bg-incorrect/30 transition-colors"
                title="Remove this outcome"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addOutcome}
          className="mt-2 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          + add outcome
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={isPending}
          className="bg-correct hover:bg-correct/90 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
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

// Extracted from the create form. Handles the freeform name + autocomplete
// from teamSuggestions for non-stat-leader markets.
function ManualOutcomeRow({ outcome, focused, suggestions, canRemove, onFocus, onBlur, onChange, onRemove }) {
  const query = (outcome.name || '').toLowerCase()
  const filtered = focused && query.length >= 1
    ? suggestions.filter((t) => t.toLowerCase().includes(query)).slice(0, 8)
    : []
  return (
    <div className="flex gap-2">
      <div className="flex-1 relative">
        <input
          type="text"
          value={outcome.name}
          onChange={(e) => onChange({ ...outcome, name: e.target.value })}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Team or player name"
          className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted"
        />
        {filtered.length > 0 && (
          <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((team) => (
              <button
                key={team}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange({ ...outcome, name: team })}
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
        value={outcome.odds}
        onChange={(e) => onChange({ ...outcome, odds: e.target.value })}
        placeholder="+150"
        className="w-24 bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted"
      />
      {canRemove && (
        <button onClick={onRemove} className="text-text-muted hover:text-incorrect text-lg">&times;</button>
      )}
    </div>
  )
}

// Stat-leader outcome: search NFL players by name, pick one to lock
// in a player_id on the outcome so the resolver can look up season
// stats. Shows position + team as a chip once selected.
function StatLeaderOutcomeRow({ outcome, canRemove, onChange, onRemove }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef()

  function search(q) {
    clearTimeout(debounceRef.current)
    if (!q || q.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(() => {
      api.get(`/admin/futures/nfl-players/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setResults(Array.isArray(r) ? r : []))
        .catch(() => setResults([]))
    }, 200)
  }

  function pickPlayer(p) {
    onChange({
      ...outcome,
      name: p.full_name,
      player_id: p.id,
      position: p.position,
      team: p.team,
    })
    setOpen(false)
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1 relative">
        <input
          type="text"
          value={outcome.name || ''}
          onChange={(e) => {
            const val = e.target.value
            // Editing after a pick clears the player_id so we can't
            // submit an outcome with a name that no longer matches.
            onChange({ ...outcome, name: val, player_id: undefined, position: undefined, team: undefined })
            search(val)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search player…"
          className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted"
        />
        {outcome.player_id && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted pointer-events-none">
            {outcome.position || ''}{outcome.team ? ` · ${outcome.team}` : ''}
          </span>
        )}
        {open && results.length > 0 && (
          <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickPlayer(p)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-accent/10 transition-colors text-left"
              >
                {p.headshot_url ? (
                  <img src={p.headshot_url} alt="" width="20" height="20" className="w-5 h-5 rounded-full bg-bg-secondary shrink-0" loading="lazy" />
                ) : <span className="w-5 h-5 rounded-full bg-bg-secondary shrink-0" />}
                <span className="flex-1 truncate">{p.full_name}</span>
                <span className="text-[10px] text-text-muted shrink-0">{p.position}{p.team ? ` · ${p.team}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        type="number"
        value={outcome.odds}
        onChange={(e) => onChange({ ...outcome, odds: e.target.value })}
        placeholder="+150"
        className="w-24 bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted"
      />
      {canRemove && (
        <button onClick={onRemove} className="text-text-muted hover:text-incorrect text-lg">&times;</button>
      )}
    </div>
  )
}
