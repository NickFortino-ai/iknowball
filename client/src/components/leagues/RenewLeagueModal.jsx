import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeagueMembers, useRenewFantasyLeague } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'

// Renew a completed fantasy league into a fresh next-season league.
// Commissioner picks which prior members to invite back (all checked
// by default); on submit the server creates the new league + fires
// invitations, and we redirect the commish there so they can schedule
// the draft as usual.
//
// Not shown here: manual username / email invites. The commish can
// still use the standard "Invite Player" flow inside the new league
// after landing there — keeping the renewal modal focused on
// carry-over avoids overwhelming a one-off action.
export default function RenewLeagueModal({ leagueId, leagueName, commissionerId, onClose }) {
  const navigate = useNavigate()
  const { data: members, isLoading } = useLeagueMembers(leagueId)
  const renew = useRenewFantasyLeague(leagueId)

  // Prior members minus the commissioner (they're auto-added to the new
  // league). Start with every one pre-checked — most commish intent is
  // "bring the same group back."
  const invitableMembers = useMemo(() => {
    return (members || []).filter((m) => m.user_id !== commissionerId)
  }, [members, commissionerId])

  const [selected, setSelected] = useState(null)

  // Lazy-init the selection once members load — useState initializer
  // won't rerun when members flip from [] to populated.
  const effectiveSelected = useMemo(() => {
    if (selected !== null) return selected
    return new Set(invitableMembers.map((m) => m.user_id))
  }, [selected, invitableMembers])

  function toggle(userId) {
    const next = new Set(effectiveSelected)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    setSelected(next)
  }

  function selectAll() {
    setSelected(new Set(invitableMembers.map((m) => m.user_id)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  async function handleSubmit() {
    try {
      const result = await renew.mutateAsync([...effectiveSelected])
      if (result.alreadyRenewed) {
        toast('This league was already renewed — taking you there', 'info')
      } else {
        toast(`Renewed! ${effectiveSelected.size} invitation${effectiveSelected.size === 1 ? '' : 's'} sent.`, 'success')
      }
      onClose?.()
      navigate(`/leagues/${result.league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to renew league', 'error')
    }
  }

  const allSelected = effectiveSelected.size === invitableMembers.length && invitableMembers.length > 0
  const noneSelected = effectiveSelected.size === 0

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-bg-primary border border-text-primary/20 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-text-primary/10 sticky top-0 bg-bg-primary z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">Renew League</div>
              <h2 className="font-display text-xl text-text-primary truncate">{leagueName}</h2>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                Creates a fresh next-season league with the same scoring, roster, and playoff settings. You'll schedule the draft after landing there.
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 text-text-muted hover:text-text-primary text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-secondary transition-colors"
              aria-label="Close"
            >×</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? (
            <LoadingSpinner />
          ) : invitableMembers.length === 0 ? (
            <div className="text-sm text-text-secondary text-center py-6">
              No prior members to invite. You'll be the only member of the new league — invite others from the new league's page.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs text-text-muted uppercase tracking-wider">
                  Bring back prior members ({effectiveSelected.size}/{invitableMembers.length})
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    disabled={allSelected}
                    className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-30 disabled:no-underline"
                  >Select all</button>
                  <span className="text-text-muted text-[11px]">·</span>
                  <button
                    onClick={deselectAll}
                    disabled={noneSelected}
                    className="text-[11px] font-semibold text-text-muted hover:text-text-primary disabled:opacity-30"
                  >Deselect all</button>
                </div>
              </div>

              <div className="rounded-xl border border-text-primary/15 divide-y divide-text-primary/10">
                {invitableMembers.map((m) => {
                  const isSelected = effectiveSelected.has(m.user_id)
                  return (
                    <button
                      key={m.user_id}
                      onClick={() => toggle(m.user_id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-bg-secondary transition-colors ${isSelected ? 'bg-accent/5' : ''}`}
                    >
                      <div className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSelected ? 'bg-accent border-accent' : 'border-text-primary/30'}`}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <Avatar user={m.users} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">
                          {m.users?.display_name || m.users?.username || 'Unknown'}
                        </div>
                        {m.users?.username && (
                          <div className="text-[11px] text-text-muted truncate">@{m.users.username}</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t border-text-primary/10 flex items-center justify-end gap-2 sticky bottom-0 bg-bg-primary">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg-secondary transition-colors"
          >Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={renew.isPending}
            className="px-5 py-2 rounded-lg text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {renew.isPending ? 'Renewing…' : 'Renew League'}
          </button>
        </div>
      </div>
    </div>
  )
}
