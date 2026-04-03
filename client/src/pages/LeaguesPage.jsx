import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMyLeagues, useReorderLeagues } from '../hooks/useLeagues'
import LeagueCard from '../components/leagues/LeagueCard'
import TrophyCase from '../components/leagues/TrophyCase'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'

const LONG_PRESS_MS = 350

function DraggableLeagueList({ leagues }) {
  const navigate = useNavigate()
  const [order, setOrder] = useState(() => leagues.map((l) => l.id))
  const [dragState, setDragState] = useState(null) // { idx, startY, currentY, cardRect }
  const itemRefs = useRef([])
  const longPressTimer = useRef(null)
  const pointerStart = useRef(null)
  const reorder = useReorderLeagues()
  const orderRef = useRef(order)
  const dragStateRef = useRef(null)
  const justDragged = useRef(false)

  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => { dragStateRef.current = dragState }, [dragState])

  // Reset order when leagues change (new league added, etc.)
  useEffect(() => {
    setOrder(leagues.map((l) => l.id))
  }, [leagues.length])

  const leagueMap = useMemo(() => {
    const map = {}
    for (const l of leagues) map[l.id] = l
    return map
  }, [leagues])

  const getDropIndex = useCallback((clientY) => {
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return Math.max(0, itemRefs.current.length - 1)
  }, [])

  useEffect(() => {
    function onMove(e) {
      const ds = dragStateRef.current
      if (!ds) {
        // Cancel long press if finger moves too much before activating
        if (longPressTimer.current && pointerStart.current) {
          const dx = Math.abs(e.clientX - pointerStart.current.x)
          const dy = Math.abs(e.clientY - pointerStart.current.y)
          if (dx > 8 || dy > 8) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
          }
        }
        return
      }
      e.preventDefault()

      setDragState((prev) => prev ? { ...prev, currentY: e.clientY } : null)

      const dropIdx = getDropIndex(e.clientY)
      setOrder((prev) => {
        const curIdx = dragStateRef.current?.idx
        if (curIdx === null || curIdx === undefined || dropIdx === curIdx) return prev
        const next = [...prev]
        const [item] = next.splice(curIdx, 1)
        next.splice(dropIdx, 0, item)
        setDragState((ds) => ds ? { ...ds, idx: dropIdx } : null)
        return next
      })
    }

    function onUp() {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }

      const ds = dragStateRef.current
      if (ds) {
        // Save order
        const currentOrder = orderRef.current
        reorder.mutate(currentOrder)
        setDragState(null)
        // Suppress the click that fires after pointerup
        justDragged.current = true
        setTimeout(() => { justDragged.current = false }, 50)
      }
      pointerStart.current = null
    }

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [getDropIndex, reorder])

  function handlePointerDown(e, idx) {
    pointerStart.current = { x: e.clientX, y: e.clientY, idx }
    const el = itemRefs.current[idx]
    if (!el) return
    const rect = el.getBoundingClientRect()

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      setDragState({
        idx,
        startY: pointerStart.current.y,
        currentY: pointerStart.current.y,
        cardRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      })
      if (navigator.vibrate) navigator.vibrate(30)
    }, LONG_PRESS_MS)
  }

  function handleClick(e, leagueId) {
    // If we just finished dragging, suppress navigation
    if (dragStateRef.current || justDragged.current) {
      e.preventDefault()
      return
    }
    // Normal click — navigate
    navigate(`/leagues/${leagueId}`)
  }

  const isDragging = dragState !== null

  return (
    <div
      className="space-y-3 relative"
      style={{ touchAction: isDragging ? 'none' : 'auto' }}
    >
      {order.map((id, i) => {
        const league = leagueMap[id]
        if (!league) return null
        const isBeingDragged = isDragging && dragState.idx === i

        return (
          <div
            key={id}
            ref={(el) => { itemRefs.current[i] = el }}
            onPointerDown={(e) => handlePointerDown(e, i)}
            onClick={(e) => handleClick(e, id)}
            className={`cursor-pointer ${
              isBeingDragged ? 'opacity-0' : ''
            } ${isDragging && !isBeingDragged ? 'transition-all duration-200' : ''}`}
          >
            <LeagueCard league={league} noLink />
          </div>
        )
      })}

      {/* Floating dragged card */}
      {dragState && (() => {
        const league = leagueMap[order[dragState.idx]]
        if (!league) return null
        const offsetY = dragState.currentY - dragState.startY
        return (
          <div
            className="fixed z-[100] pointer-events-none"
            style={{
              top: dragState.cardRect.top + offsetY,
              left: dragState.cardRect.left,
              width: dragState.cardRect.width,
              transition: 'box-shadow 0.2s',
            }}
          >
            <div className="scale-[1.04] shadow-2xl shadow-black/40 rounded-xl ring-2 ring-accent/50">
              <LeagueCard league={league} noLink />
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default function LeaguesPage() {
  const { data: leagues, isLoading, isError, refetch } = useMyLeagues()
  const [showCompleted, setShowCompleted] = useState(false)

  const { active, completed } = useMemo(() => {
    if (!leagues) return { active: [], completed: [] }
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    return {
      active: leagues.filter((l) => l.status !== 'completed' || (l.updated_at && new Date(l.updated_at).getTime() > oneDayAgo)),
      completed: leagues.filter((l) => l.status === 'completed' && (!l.updated_at || new Date(l.updated_at).getTime() <= oneDayAgo)),
    }
  }, [leagues])

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-6 pb-32">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="font-display text-3xl">My Leagues</h1>
        <div data-onboarding="leagues-actions" className="flex flex-col sm:flex-row gap-2">
          <Link
            to="/leagues/join"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 backdrop-blur text-text-secondary hover:bg-white/10 transition-colors border border-accent text-center"
          >
            Join League
          </Link>
          <Link
            to="/leagues/create"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 backdrop-blur text-text-secondary hover:bg-white/10 transition-colors border border-accent text-center"
          >
            Create League
          </Link>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState title="Failed to load leagues" message="Check your connection and try again." onRetry={refetch} />
      ) : !leagues?.length ? (
        <EmptyState
          title="No leagues yet"
          message="Create a league or join one with an invite code"
        />
      ) : (
        <>
          {active.length > 0 ? (
            <DraggableLeagueList leagues={active} />
          ) : (
            <EmptyState
              title="No active leagues"
              message="Create a league or join one with an invite code"
            />
          )}

          {completed.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors mb-3"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Completed Leagues ({completed.length})
              </button>
              {showCompleted && (
                <div className="space-y-3">
                  {completed.map((league) => (
                    <LeagueCard key={league.id} league={league} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-6">
        <TrophyCase />
      </div>

    </div>
  )
}
