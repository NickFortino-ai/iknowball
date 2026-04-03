import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMyLeagues, useReorderLeagues } from '../hooks/useLeagues'
import LeagueCard from '../components/leagues/LeagueCard'
import TrophyCase from '../components/leagues/TrophyCase'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'

function DragHandle() {
  return (
    <svg className="w-5 h-5 text-text-muted" viewBox="0 0 20 20" fill="currentColor">
      <circle cx="7" cy="4" r="1.5" />
      <circle cx="13" cy="4" r="1.5" />
      <circle cx="7" cy="10" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="7" cy="16" r="1.5" />
      <circle cx="13" cy="16" r="1.5" />
    </svg>
  )
}

function ReorderableLeagueList({ leagues, onSave, onCancel }) {
  const [order, setOrder] = useState(leagues.map((l) => l.id))
  const [dragIdx, setDragIdx] = useState(null)
  const itemRefs = useRef([])
  const dragIdxRef = useRef(null)
  const orderRef = useRef(order)
  const reorder = useReorderLeagues()

  // Keep refs in sync with state
  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => { dragIdxRef.current = dragIdx }, [dragIdx])

  const leagueMap = useMemo(() => {
    const map = {}
    for (const l of leagues) map[l.id] = l
    return map
  }, [leagues])

  const getIndexFromY = useCallback((clientY) => {
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return itemRefs.current.length - 1
  }, [])

  // Document-level pointer handlers for drag
  useEffect(() => {
    function onMove(e) {
      if (dragIdxRef.current === null) return
      e.preventDefault()
      const newOver = getIndexFromY(e.clientY)
      if (newOver !== dragIdxRef.current) {
        setOrder((prev) => {
          const next = [...prev]
          const [item] = next.splice(dragIdxRef.current, 1)
          next.splice(newOver, 0, item)
          return next
        })
        setDragIdx(newOver)
      }
    }
    function onUp() {
      setDragIdx(null)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [getIndexFromY])

  function handlePointerDown(e, idx) {
    e.preventDefault()
    setDragIdx(idx)
  }

  async function handleSave() {
    try {
      await reorder.mutateAsync(order)
      onSave()
    } catch {
      // Mutation handles error
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-text-muted">Drag to reorder</span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-text-primary/20 text-text-secondary hover:bg-text-primary/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={reorder.isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {reorder.isPending ? 'Saving...' : 'Save Order'}
          </button>
        </div>
      </div>
      <div className="space-y-3 select-none">
        {order.map((id, i) => {
          const league = leagueMap[id]
          if (!league) return null
          const isDragging = dragIdx === i
          return (
            <div
              key={id}
              ref={(el) => { itemRefs.current[i] = el }}
              className={`flex items-center gap-3 transition-all duration-150 ${isDragging ? 'opacity-60 scale-[1.02] z-50 relative' : ''}`}
            >
              <div
                onPointerDown={(e) => handlePointerDown(e, i)}
                className="shrink-0 p-2 cursor-grab active:cursor-grabbing touch-none"
              >
                <DragHandle />
              </div>
              <div className="flex-1 min-w-0 pointer-events-none">
                <LeagueCard league={league} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LeaguesPage() {
  const { data: leagues, isLoading, isError, refetch } = useMyLeagues()
  const [showCompleted, setShowCompleted] = useState(false)
  const [reordering, setReordering] = useState(false)

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
          {!reordering && active.length > 1 && (
            <button
              onClick={() => setReordering(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 backdrop-blur text-text-secondary hover:bg-white/10 transition-colors border border-text-primary/20 text-center"
            >
              Reorder
            </button>
          )}
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
          {reordering ? (
            <ReorderableLeagueList
              leagues={active}
              onSave={() => setReordering(false)}
              onCancel={() => setReordering(false)}
            />
          ) : active.length > 0 ? (
            <div className="space-y-3">
              {active.map((league) => (
                <LeagueCard key={league.id} league={league} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active leagues"
              message="Create a league or join one with an invite code"
            />
          )}

          {completed.length > 0 && !reordering && (
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
