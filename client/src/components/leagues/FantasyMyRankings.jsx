import { useState, useMemo, useEffect } from 'react'
import { useMyRankings, useSetMyRankings, useResetMyRankings } from '../../hooks/useLeagues'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const POS_COLORS = {
  QB: 'bg-red-500/20 text-red-300',
  RB: 'bg-green-500/20 text-green-300',
  WR: 'bg-yellow-500/20 text-yellow-300',
  TE: 'bg-blue-500/20 text-blue-300',
  K: 'bg-gray-500/20 text-gray-300',
  DEF: 'bg-purple-500/20 text-purple-300',
}

export default function FantasyMyRankings({ league }) {
  const { data, isLoading } = useMyRankings(league.id)
  const setRankings = useSetMyRankings()
  const resetRankings = useResetMyRankings()

  // Local working copy — applied via Save button
  const [working, setWorking] = useState([])
  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [jumpTarget, setJumpTarget] = useState({}) // playerId → input value

  // Sync server data into working copy on first load and after refetches
  useEffect(() => {
    if (data) setWorking(data.map((r) => ({ ...r })))
  }, [data])

  const dirty = useMemo(() => {
    if (!data || !working.length) return false
    if (data.length !== working.length) return true
    for (let i = 0; i < working.length; i++) {
      if (working[i].player_id !== data[i].player_id) return true
    }
    return false
  }, [working, data])

  function move(playerId, direction) {
    const idx = working.findIndex((r) => r.player_id === playerId)
    if (idx < 0) return
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= working.length) return
    const next = [...working]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setWorking(next)
  }

  function jumpTo(playerId, targetRank) {
    const idx = working.findIndex((r) => r.player_id === playerId)
    if (idx < 0) return
    const target = Math.max(0, Math.min(working.length - 1, targetRank - 1))
    if (target === idx) return
    const next = [...working]
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item)
    setWorking(next)
    setJumpTarget((prev) => ({ ...prev, [playerId]: '' }))
  }

  function remove(playerId) {
    setWorking(working.filter((r) => r.player_id !== playerId))
  }

  async function handleSave() {
    try {
      await setRankings.mutateAsync({ leagueId: league.id, playerIds: working.map((r) => r.player_id) })
      toast('Rankings saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save', 'error')
    }
  }

  async function handleReset() {
    if (!confirm('Reset to current ADP? Your edits will be lost.')) return
    try {
      await resetRankings.mutateAsync(league.id)
      toast('Reset to ADP', 'success')
    } catch (err) {
      toast(err.message || 'Failed to reset', 'error')
    }
  }

  if (isLoading) return <LoadingSpinner />

  const filtered = working
    .map((r, i) => ({ ...r, currentRank: i + 1 }))
    .filter((r) => posFilter === 'All' || r.nfl_players?.position === posFilter)
    .filter((r) => !searchQuery || r.nfl_players?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="space-y-3">
      {/* Header / actions */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-card p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="font-display text-base text-text-primary">My Rankings</h3>
            <p className="text-[11px] text-text-muted">Edit your personal big board. Used in the draft room as an alternate view.</p>
          </div>
          <button
            onClick={handleReset}
            disabled={resetRankings.isPending}
            className="text-[11px] text-text-muted hover:text-incorrect underline disabled:opacity-50 shrink-0"
          >
            Reset to ADP
          </button>
        </div>

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search players..."
          className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="flex gap-1 mt-2 overflow-x-auto">
          {POSITION_FILTERS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                posFilter === pos ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary'
              }`}
            >{pos}</button>
          ))}
        </div>
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky top-0 z-10 rounded-xl border border-accent bg-accent/15 p-2 flex items-center justify-between gap-2">
          <span className="text-xs text-accent font-semibold">Unsaved changes</span>
          <div className="flex gap-2">
            <button
              onClick={() => setWorking(data.map((r) => ({ ...r })))}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-bg-card border border-text-primary/20 text-text-secondary"
            >Discard</button>
            <button
              onClick={handleSave}
              disabled={setRankings.isPending}
              className="px-4 py-1 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >{setRankings.isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}

      {/* Ranked list */}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="max-h-[65vh] overflow-y-auto divide-y divide-text-primary/10">
          {filtered.map((r) => {
            const p = r.nfl_players
            if (!p) return null
            return (
              <div key={r.player_id} className="flex items-center gap-2 px-2 py-2 md:py-2">
                <span className="text-xs font-bold text-text-muted w-8 text-center shrink-0">{r.currentRank}</span>
                {p.headshot_url && (
                  <img
                    src={p.headshot_url}
                    alt={p.full_name}
                    className="w-9 h-9 rounded-full object-cover bg-bg-secondary shrink-0"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{p.full_name}</div>
                  <div className="text-[10px] text-text-muted flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${POS_COLORS[p.position] || 'bg-text-primary/10 text-text-muted'}`}>{p.position}</span>
                    <span>{p.team || 'FA'}</span>
                    {p.bye_week && <span>· Bye {p.bye_week}</span>}
                  </div>
                </div>
                {/* Jump-to */}
                <input
                  type="number"
                  min={1}
                  max={working.length}
                  placeholder="#"
                  value={jumpTarget[r.player_id] || ''}
                  onChange={(e) => setJumpTarget((prev) => ({ ...prev, [r.player_id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = Number(jumpTarget[r.player_id])
                      if (v > 0) jumpTo(r.player_id, v)
                    }
                  }}
                  onBlur={() => {
                    const v = Number(jumpTarget[r.player_id])
                    if (v > 0) jumpTo(r.player_id, v)
                  }}
                  className="w-12 text-center bg-bg-secondary border border-text-primary/20 rounded-md text-xs text-text-primary px-1 py-1 shrink-0"
                />
                <button onClick={() => move(r.player_id, 'up')} className="text-text-muted hover:text-text-primary w-9 h-9 flex items-center justify-center rounded-lg active:bg-bg-secondary shrink-0">▲</button>
                <button onClick={() => move(r.player_id, 'down')} className="text-text-muted hover:text-text-primary w-9 h-9 flex items-center justify-center rounded-lg active:bg-bg-secondary shrink-0">▼</button>
                <button onClick={() => remove(r.player_id)} className="text-text-muted hover:text-incorrect w-9 h-9 flex items-center justify-center rounded-lg active:bg-bg-secondary text-lg shrink-0">×</button>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-text-muted py-8">No players match your filters.</div>
          )}
        </div>
      </div>
    </div>
  )
}
