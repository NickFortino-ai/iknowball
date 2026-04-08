import { useState, useMemo, useEffect, useRef } from 'react'
import { useMyRankings, useSetMyRankings, useResetMyRankings, useDraftBoard } from '../../hooks/useLeagues'
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

const ROW_HEIGHT = 56 // px — used to compute drag drop targets

export default function FantasyMyRankings({ league }) {
  const { data, isLoading } = useMyRankings(league.id)
  const { data: draftData } = useDraftBoard(league.id)
  const setRankings = useSetMyRankings()
  const resetRankings = useResetMyRankings()

  const [working, setWorking] = useState([])
  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [editMode, setEditMode] = useState(false)

  // Sync server data into working copy
  useEffect(() => {
    if (data) setWorking(data.map((r) => ({ ...r })))
  }, [data])

  // Drafted players are filtered out of the display
  const draftedSet = useMemo(() => {
    const ids = new Set()
    for (const p of (draftData?.picks || [])) {
      if (p.player_id) ids.add(p.player_id)
    }
    return ids
  }, [draftData])

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
      await setRankings.mutateAsync({ leagueId: league.id, playerIds: working.map((r) => r.player_id) })
      setEditMode(false)
      toast('Rankings saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save', 'error')
    }
  }

  async function handleReset() {
    if (!confirm('Reset to current ADP for this league? Your edits will be lost.')) return
    try {
      await resetRankings.mutateAsync(league.id)
      toast('Reset to ADP', 'success')
    } catch (err) {
      toast(err.message || 'Failed to reset', 'error')
    }
  }

  // ── Drag-to-reorder (edit mode only) ─────────────────────────────
  // Operates on the *full* working array index, not the filtered list,
  // so position/search filters can stay applied while dragging.
  const dragIdx = useRef(null)
  const dragStartY = useRef(0)
  const [draggingPlayerId, setDraggingPlayerId] = useState(null)
  const docHandlersRef = useRef(null)

  function detachDocHandlers() {
    if (docHandlersRef.current) {
      window.removeEventListener('pointermove', docHandlersRef.current.move)
      window.removeEventListener('pointerup', docHandlersRef.current.up)
      window.removeEventListener('pointercancel', docHandlersRef.current.up)
      docHandlersRef.current = null
    }
  }

  function startDrag(playerId, e) {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()
    const idx = working.findIndex((r) => r.player_id === playerId)
    if (idx < 0) return
    dragIdx.current = idx
    dragStartY.current = e.clientY
    setDraggingPlayerId(playerId)

    const onMove = (moveE) => {
      if (dragIdx.current == null) return
      moveE.preventDefault?.()
      const delta = moveE.clientY - dragStartY.current
      // Move in row-height steps
      const stepDelta = Math.round(delta / ROW_HEIGHT)
      if (stepDelta === 0) return
      const newIdx = Math.max(0, Math.min(working.length - 1, dragIdx.current + stepDelta))
      if (newIdx === dragIdx.current) return
      setWorking((prev) => {
        const next = [...prev]
        const [item] = next.splice(dragIdx.current, 1)
        next.splice(newIdx, 0, item)
        return next
      })
      dragIdx.current = newIdx
      dragStartY.current = moveE.clientY
    }
    const onUp = () => {
      dragIdx.current = null
      setDraggingPlayerId(null)
      detachDocHandlers()
    }
    docHandlersRef.current = { move: onMove, up: onUp }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
  }

  // Cleanup on unmount
  useEffect(() => () => detachDocHandlers(), [])

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
            <h3 className="font-display text-base text-text-primary">My Rankings</h3>
            <p className="text-[11px] text-text-muted">
              {editMode
                ? 'Tap and drag the ⋮⋮ handle to reorder. Tap Save when done.'
                : 'Your personal big board. Tap Edit to drag-reorder.'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {!editMode && (
              <button
                onClick={handleReset}
                disabled={resetRankings.isPending}
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
                disabled={setRankings.isPending}
                className="px-4 py-1 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {setRankings.isPending ? 'Saving...' : 'Save'}
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
          {visible.map((r) => {
            const p = r.nfl_players
            if (!p) return null
            const isDragging = draggingPlayerId === r.player_id
            return (
              <div
                key={r.player_id}
                className={`flex items-center gap-2 px-2 py-2.5 transition-colors ${isDragging ? 'bg-accent/20 ring-1 ring-accent shadow-lg z-20 relative' : ''}`}
                style={{ touchAction: editMode ? 'none' : undefined }}
              >
                {/* Drag handle (edit mode only) */}
                {editMode && (
                  <button
                    onPointerDown={(e) => startDrag(r.player_id, e)}
                    className="shrink-0 w-8 h-10 flex items-center justify-center text-text-muted active:text-text-primary cursor-grab active:cursor-grabbing"
                    title="Drag to reorder"
                  >
                    <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
                      <circle cx="4" cy="4" r="1.5" />
                      <circle cx="10" cy="4" r="1.5" />
                      <circle cx="4" cy="10" r="1.5" />
                      <circle cx="10" cy="10" r="1.5" />
                      <circle cx="4" cy="16" r="1.5" />
                      <circle cx="10" cy="16" r="1.5" />
                    </svg>
                  </button>
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
                    <span className={`px-1.5 py-0.5 rounded font-bold ${POS_COLORS[p.position] || 'bg-text-primary/10 text-text-muted'}`}>{p.position}</span>
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
