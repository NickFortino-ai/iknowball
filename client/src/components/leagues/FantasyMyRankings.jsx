import { useState, useMemo, useEffect } from 'react'
import { useMyRankings, useSetMyRankings, useResetMyRankings, useDraftBoard } from '../../hooks/useLeagues'
import { useDraftPrepRankings, useSetDraftPrepRankings, useResetDraftPrepRankings, useDraftPrepSync } from '../../hooks/useDraftPrep'
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

/**
 * Dual-mode rankings component.
 * - League mode: pass { league } — reads/writes fantasy_user_rankings (or draft_prep if synced)
 * - Draft Prep mode: pass { draftPrepConfig: { scoringFormat, configHash } }
 */
export default function FantasyMyRankings({ league, draftPrepConfig }) {
  const isDraftPrep = !!draftPrepConfig

  // Check if this league is synced with Draft Prep
  const { data: syncList } = useDraftPrepSync()
  const isSynced = !isDraftPrep && league && syncList?.some(s => s.league_id === league.id)

  // League-mode hooks (only called when league is provided)
  const leagueRankings = useMyRankings(isDraftPrep ? null : league?.id)
  const leagueSetRankings = useSetMyRankings()
  const leagueResetRankings = useResetMyRankings()
  const { data: draftData } = useDraftBoard(isDraftPrep ? null : league?.id)

  // Draft Prep mode hooks (only called when draftPrepConfig is provided)
  const prepRankings = useDraftPrepRankings(
    isDraftPrep ? draftPrepConfig.scoringFormat : null,
    isDraftPrep ? draftPrepConfig.configHash : null,
  )
  const prepSetRankings = useSetDraftPrepRankings()
  const prepResetRankings = useResetDraftPrepRankings()

  // Unify the interface
  const { data, isLoading } = isDraftPrep ? prepRankings : leagueRankings

  const [working, setWorking] = useState([])
  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [editMode, setEditMode] = useState(false)

  // Sync server data into working copy
  useEffect(() => {
    if (data) setWorking(data.map((r) => ({ ...r })))
  }, [data])

  // Drafted players are filtered out of the display (league mode only)
  const draftedSet = useMemo(() => {
    if (isDraftPrep) return new Set()
    const ids = new Set()
    for (const p of (draftData?.picks || [])) {
      if (p.player_id) ids.add(p.player_id)
    }
    return ids
  }, [draftData, isDraftPrep])

  const dirty = useMemo(() => {
    if (!data || !working.length) return false
    if (data.length !== working.length) return true
    for (let i = 0; i < working.length; i++) {
      if (working[i].player_id !== data[i].player_id) return true
    }
    return false
  }, [working, data])

  async function handleSave() {
    try {
      if (isDraftPrep) {
        await prepSetRankings.mutateAsync({
          scoringFormat: draftPrepConfig.scoringFormat,
          configHash: draftPrepConfig.configHash,
          playerIds: working.map((r) => r.player_id),
        })
      } else {
        await leagueSetRankings.mutateAsync({ leagueId: league.id, playerIds: working.map((r) => r.player_id) })
      }
      setEditMode(false)
      toast('Rankings saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save', 'error')
    }
  }

  async function handleReset() {
    if (!confirm('Reset to current ADP? Your edits will be lost.')) return
    try {
      if (isDraftPrep) {
        await prepResetRankings.mutateAsync({
          scoringFormat: draftPrepConfig.scoringFormat,
          configHash: draftPrepConfig.configHash,
        })
      } else {
        await leagueResetRankings.mutateAsync(league.id)
      }
      toast('Reset to ADP', 'success')
    } catch (err) {
      toast(err.message || 'Failed to reset', 'error')
    }
  }

  const isSaving = isDraftPrep ? prepSetRankings.isPending : leagueSetRankings.isPending
  const isResetting = isDraftPrep ? prepResetRankings.isPending : leagueResetRankings.isPending

  // ── Move up/down (edit mode only) ────────────────────────────────
  function movePlayer(playerId, direction) {
    const idx = working.findIndex((r) => r.player_id === playerId)
    if (idx < 0) return
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= working.length) return
    setWorking((prev) => {
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  if (isLoading) return <LoadingSpinner />

  // Compute rank from the FULL working list (drafted + undrafted) so each
  // player's rank stays fixed as players above them get drafted. Then
  // filter for display.
  const visible = working
    .map((r, i) => ({ ...r, currentRank: i + 1 }))
    .filter((r) => !draftedSet.has(r.player_id))
    .filter((r) => posFilter === 'All' || r.nfl_players?.position === posFilter)
    .filter((r) => !searchQuery || r.nfl_players?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="space-y-3">
      {/* Header / actions */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base text-text-primary">My Rankings</h3>
              {isSynced && (
                <span className="text-[10px] font-semibold text-accent bg-accent/10 border border-accent/30 rounded-full px-2 py-0.5">
                  Synced with Draft Prep
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-muted">
              {editMode
                ? 'Use the arrows to reorder. Tap Save when done.'
                : 'Your personal big board. Tap Edit to reorder.'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {!editMode && (
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="text-[11px] text-text-muted hover:text-incorrect underline disabled:opacity-50"
              >
                Reset to ADP
              </button>
            )}
            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-bg-secondary border border-text-primary/20 text-text-primary"
              >
                Edit
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-1 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
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

      {/* Sticky discard prompt while editing */}
      {editMode && dirty && (
        <div className="sticky top-0 z-10 rounded-xl border border-accent bg-accent/15 p-2 flex items-center justify-between gap-2">
          <span className="text-xs text-accent font-semibold">Unsaved changes</span>
          <button
            onClick={() => { setWorking(data.map((r) => ({ ...r }))); setEditMode(false) }}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-bg-card border border-text-primary/20 text-text-secondary"
          >Discard</button>
        </div>
      )}

      {/* Ranked list */}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="max-h-[65vh] overflow-y-auto divide-y divide-text-primary/10">
          {visible.map((r, visibleIdx) => {
            const p = r.nfl_players
            if (!p) return null
            const workingIdx = working.findIndex((w) => w.player_id === r.player_id)
            return (
              <div
                key={r.player_id}
                className="flex items-center gap-2 px-2 py-2.5"
              >
                {/* Move buttons (edit mode only) */}
                {editMode && (
                  <div className="shrink-0 flex flex-col gap-0.5">
                    <button
                      onClick={() => movePlayer(r.player_id, 'up')}
                      disabled={workingIdx <= 0}
                      className="w-7 h-5 flex items-center justify-center text-text-muted hover:text-text-primary disabled:opacity-20 transition-colors"
                    >▲</button>
                    <button
                      onClick={() => movePlayer(r.player_id, 'down')}
                      disabled={workingIdx >= working.length - 1}
                      className="w-7 h-5 flex items-center justify-center text-text-muted hover:text-text-primary disabled:opacity-20 transition-colors"
                    >▼</button>
                  </div>
                )}
                <span className="text-xs font-bold text-text-muted w-8 text-center shrink-0">{r.currentRank}</span>
                {p.headshot_url && (
                  <img
                    src={p.headshot_url}
                    alt={p.full_name}
                    width="36"
                    height="36"
                    loading="lazy"
                    decoding="async"
                    className="w-9 h-9 rounded-full object-cover bg-bg-secondary shrink-0"
                    onError={(e) => { e.target.style.visibility = 'hidden' }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{p.full_name}</div>
                  <div className="text-[10px] text-text-muted flex items-center gap-1.5">
                    <span className="font-bold text-text-primary">{p.position}</span>
                    <span>{p.team || 'FA'}</span>
                    {p.bye_week && <span>· Bye {p.bye_week}</span>}
                  </div>
                </div>
              </div>
            )
          })}
          {visible.length === 0 && (
            <div className="text-center text-sm text-text-muted py-8">No players match your filters.</div>
          )}
        </div>
      </div>
    </div>
  )
}
