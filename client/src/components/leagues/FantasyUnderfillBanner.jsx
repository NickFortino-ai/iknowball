import { useState } from 'react'
import { useFantasyUnderfillState, useResizeFantasyLeague, useCancelFantasyLeague, usePostponeFantasyDraft, useUpdateLeague } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import { useNavigate } from 'react-router-dom'

/**
 * Commissioner-only banner that appears on a traditional fantasy league
 * page when the league is underfilled. Opens a modal with three actions:
 *
 *   - Postpone draft (datetime picker → POST /fantasy/postpone-draft)
 *   - Resize league  (drop most recent N → POST /fantasy/resize) — only
 *                    visible when state === 'resizable'
 *   - Cancel league  (POST /fantasy/cancel)
 *
 * Plus a "Switch to open" suggestion if the league is currently
 * invite-only — increases the chance of filling up.
 */
export default function FantasyUnderfillBanner({ league }) {
  const navigate = useNavigate()
  const { data: state } = useFantasyUnderfillState(league?.id)
  const resize = useResizeFantasyLeague(league?.id)
  const cancel = useCancelFantasyLeague(league?.id)
  const postpone = usePostponeFantasyDraft(league?.id)
  const updateLeague = useUpdateLeague()

  const [open, setOpen] = useState(false)
  const [postponeDate, setPostponeDate] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  if (!league || league.format !== 'fantasy') return null
  if (!state || state.state === 'ok') return null

  const isBelowThreshold = state.state === 'below_threshold'
  const isResizable = state.state === 'resizable'

  async function handleResize() {
    try {
      const result = await resize.mutateAsync()
      toast(`League resized to ${result.newSize} teams`, 'success')
      setOpen(false)
    } catch (err) {
      toast(err.message || 'Failed to resize', 'error')
    }
  }

  async function handlePostpone() {
    if (!postponeDate) {
      toast('Pick a new draft date first', 'error')
      return
    }
    try {
      const iso = new Date(postponeDate).toISOString()
      await postpone.mutateAsync(iso)
      toast('Draft postponed', 'success')
      setOpen(false)
      setPostponeDate('')
    } catch (err) {
      toast(err.message || 'Failed to postpone', 'error')
    }
  }

  async function handleCancel() {
    try {
      await cancel.mutateAsync()
      toast('League canceled', 'success')
      navigate('/leagues')
    } catch (err) {
      toast(err.message || 'Failed to cancel', 'error')
    }
  }

  async function handleSwitchToOpen() {
    try {
      await updateLeague.mutateAsync({ id: league.id, visibility: 'open' })
      toast('League is now open — others can find and join it', 'success')
    } catch (err) {
      toast(err.message || 'Failed to switch visibility', 'error')
    }
  }

  return (
    <>
      <div className="rounded-xl border-2 border-yellow-500/50 bg-yellow-500/10 p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-base text-yellow-500 mb-1">League is underfilled</h3>
            <p className="text-sm text-text-secondary mb-3">
              {isBelowThreshold
                ? `Only ${state.currentCount} of ${league.member_count >= state.currentCount ? league.member_count : ''}${state.currentCount === 1 ? '' : ' '}members have joined. IKB doesn't run traditional fantasy leagues with fewer than 6 teams. You can postpone the draft to give more people a chance to join, or cancel the league.`
                : `Only ${state.currentCount} members have joined a league set up for more. You can resize down to ${state.targetEven} teams (drops the ${state.willDrop} most recent signup${state.willDrop === 1 ? '' : 's'}), postpone the draft, or cancel the league.`}
            </p>
            <button
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-500 text-bg-primary hover:bg-yellow-400 transition-colors"
            >
              Resolve
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center px-0 md:px-4" onClick={() => setOpen(false)}>
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-text-primary mb-1">Resolve underfilled league</h3>
            <p className="text-sm text-text-secondary mb-5">
              {isBelowThreshold
                ? `Your league has ${state.currentCount} members. IKB needs at least 6 to run a traditional fantasy league.`
                : `Your league has ${state.currentCount} members but is set for ${league?.member_count != null ? '' : ''}an invalid count. Pick how to resolve it.`}
            </p>

            {/* Switch to open suggestion if invite-only */}
            {league.visibility === 'closed' && (
              <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 mb-4">
                <div className="text-sm font-semibold text-accent mb-1">Try switching to open</div>
                <p className="text-xs text-text-secondary mb-3">
                  Your league is invite-only. Switching to open lets anyone discover and join it, which can fill the remaining spots faster.
                </p>
                <button
                  onClick={handleSwitchToOpen}
                  disabled={updateLeague.isPending}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {updateLeague.isPending ? 'Updating…' : 'Switch to Open'}
                </button>
              </div>
            )}

            {/* Postpone */}
            <div className="rounded-xl border border-text-primary/20 p-4 mb-3">
              <div className="text-sm font-semibold text-text-primary mb-2">Postpone the draft</div>
              <input
                type="datetime-local"
                value={postponeDate}
                onChange={(e) => setPostponeDate(e.target.value)}
                className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent mb-3"
              />
              <button
                onClick={handlePostpone}
                disabled={postpone.isPending || !postponeDate}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-bg-card border border-text-primary/20 text-text-primary hover:bg-bg-card-hover transition-colors disabled:opacity-50"
              >
                {postpone.isPending ? 'Postponing…' : 'Postpone Draft'}
              </button>
            </div>

            {/* Resize — only when there are at least 6 members */}
            {isResizable && (
              <div className="rounded-xl border border-text-primary/20 p-4 mb-3">
                <div className="text-sm font-semibold text-text-primary mb-1">Resize — drop the most recent {state.willDrop} signup{state.willDrop === 1 ? '' : 's'}</div>
                <p className="text-xs text-text-secondary mb-3">
                  Resizes the league to {state.targetEven} teams. The {state.willDrop} most recent member{state.willDrop === 1 ? '' : 's'} will be removed from this league and notified that they can join another open league.
                </p>
                <button
                  onClick={handleResize}
                  disabled={resize.isPending}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {resize.isPending ? 'Resizing…' : `Resize to ${state.targetEven} teams`}
                </button>
              </div>
            )}

            {/* Cancel — last */}
            <div className="rounded-xl border border-incorrect/40 p-4">
              <div className="text-sm font-semibold text-incorrect mb-1">Cancel the league</div>
              <p className="text-xs text-text-secondary mb-3">
                Permanently deletes the league. All members are notified and the league disappears from My Leagues. This can't be undone.
              </p>
              {!confirmingCancel ? (
                <button
                  onClick={() => setConfirmingCancel(true)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-bg-card border border-incorrect/40 text-incorrect hover:bg-incorrect/10 transition-colors"
                >
                  Cancel League
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-bg-card border border-text-primary/20 text-text-secondary hover:bg-bg-card-hover transition-colors"
                  >
                    Keep League
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancel.isPending}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-incorrect text-white hover:bg-incorrect/80 transition-colors disabled:opacity-50"
                  >
                    {cancel.isPending ? 'Canceling…' : 'Confirm Cancel'}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-full mt-4 py-2.5 rounded-lg text-sm font-semibold text-text-muted hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
