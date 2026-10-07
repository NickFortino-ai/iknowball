import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import InjuryBadge from '../ui/InjuryBadge'
import { useReadState, READ_KINDS } from '../../hooks/useReadState'
import { markBlurbSeen } from './BlurbDot'

/**
 * Every player note on your roster in one place, unread first.
 *
 * Reading is registered by DWELL, not by crossing the viewport: a note has
 * to be at least half visible for a sustained moment before it counts. A
 * flick that carries three players past the screen hasn't shown them to
 * anyone, and clearing a dot is irreversible — nothing in the app can mark
 * something unread again.
 *
 * Marks are collected while the sheet is open and flushed once on close.
 * markBlurbSeen writes localStorage and POSTs per call, so marking live
 * during a scroll would fire a request per player; batching also keeps the
 * list from restyling under the user's thumb mid-read.
 *
 * Portalled to body like every other modal here — rendered inline it would
 * inherit the league page's stacking context and the navbar would paint
 * over it.
 */

// Half the row visible, held this long. Long enough that scrolling past
// doesn't count, short enough that deliberately stopping on a note does.
const DWELL_MS = 900
const VISIBLE_RATIO = 0.5

function UpdateRow({ update, isUnread, onDwell }) {
  const ref = useRef(null)

  useEffect(() => {
    // Only unread rows need watching; a read one has nothing to mark.
    if (!isUnread) return
    const el = ref.current
    if (!el) return

    let timer = null
    const clear = () => { if (timer) { clearTimeout(timer); timer = null } }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
          if (!timer) timer = setTimeout(() => { timer = null; onDwell(update.player_id, update.latest_id) }, DWELL_MS)
        } else {
          // Left the window before the dwell completed — it doesn't count.
          clear()
        }
      },
      { threshold: [VISIBLE_RATIO] },
    )
    observer.observe(el)
    return () => { clear(); observer.disconnect() }
  }, [isUnread, update.player_id, update.latest_id, onDwell])

  return (
    <div ref={ref} className="py-4 first:pt-1">
      <div className="flex items-center gap-3 mb-1.5">
        {update.headshot_url ? (
          <img
            src={update.headshot_url}
            alt=""
            className="w-9 h-9 rounded-full object-cover bg-bg-secondary shrink-0"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="w-9 h-9 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-text-primary truncate">{update.player_name}</span>
            {update.injury_status && <InjuryBadge status={update.injury_status} />}
            {/* Same dot the roster row shows, so the connection is obvious.
                Deliberately not removed the instant it is marked — the list
                is frozen while open so nothing shifts mid-read. */}
            {isUnread && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
          </div>
          <div className="text-xs text-text-muted">
            {[update.position, update.team].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{update.content}</p>
    </div>
  )
}

export default function RosterUpdatesSheet({ updates, isLoading, onClose }) {
  const queryClient = useQueryClient()
  const readState = useReadState()
  const pending = useRef(new Map())

  // Snapshot unread-ness ONCE, the first time data arrives. If it tracked
  // live read state the rows would re-sort and lose their dots while being
  // read.
  //
  // Frozen on arrival rather than on mount: the content query only starts
  // when the sheet opens, so at first render `updates` is still undefined —
  // snapshotting there would freeze an empty list that never recovers.
  const [frozen, setFrozen] = useState(null)
  useEffect(() => {
    if (frozen || !updates) return
    const seen = readState[READ_KINDS.BLURB] || {}
    const unread = updates.filter((u) => seen[u.player_id] !== u.latest_id)
    const read = updates.filter((u) => seen[u.player_id] === u.latest_id)
    setFrozen({ unread, read, unreadIds: new Set(unread.map((u) => u.player_id)) })
  }, [updates, frozen, readState])

  const flush = useRef(() => {})
  flush.current = () => {
    for (const [playerId, latestId] of pending.current) markBlurbSeen(playerId, latestId, queryClient)
    pending.current.clear()
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Flush on unmount too, so dismissing by any route still records what
    // was actually read.
    return () => { document.removeEventListener('keydown', onKey); flush.current() }
  }, [onClose])

  const handleDwell = useMemo(() => (playerId, latestId) => {
    if (!playerId || !latestId) return
    pending.current.set(playerId, latestId)
  }, [])

  const rows = frozen ? [...frozen.unread, ...frozen.read] : []

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-bg-secondary rounded-t-2xl sm:rounded-2xl border border-text-primary/20 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-4 pb-4 pt-4 border-b border-text-primary/10 shrink-0 relative">
          <h3 className="font-display text-xl text-text-primary text-center px-14">Player Updates</h3>
          <p className="text-sm text-text-muted mt-1 text-center px-6">
            {!frozen
              ? '\u00a0'
              : frozen.unread.length > 0
              ? `${frozen.unread.length} new ${frozen.unread.length === 1 ? 'note' : 'notes'} on your roster.`
              : 'You’re all caught up.'}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 w-11 h-11 rounded-full bg-bg-card text-text-primary text-xl hover:bg-bg-card-hover active:bg-bg-card-hover flex items-center justify-center shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 divide-y divide-text-primary/15">
          {isLoading && (
            <p className="text-sm text-text-muted text-center py-8">Loading updates…</p>
          )}
          {!isLoading && frozen && rows.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">
              No player notes for your roster yet.
            </p>
          )}
          {rows.map((u) => (
            <UpdateRow
              key={u.player_id}
              update={u}
              isUnread={frozen?.unreadIds.has(u.player_id)}
              onDwell={handleDwell}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
