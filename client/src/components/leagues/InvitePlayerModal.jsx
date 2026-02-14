import { useState } from 'react'
import { useSearchUsers, useSendInvitation, useLeagueInvitations } from '../../hooks/useInvitations'
import { toast } from '../ui/Toast'

const STATUS_STYLES = {
  pending: 'bg-accent/20 text-accent',
  accepted: 'bg-correct/20 text-correct',
  declined: 'bg-text-muted/20 text-text-muted',
}

export default function InvitePlayerModal({ leagueId, onClose }) {
  const [query, setQuery] = useState('')
  const { data: searchResults } = useSearchUsers(query)
  const { data: invitations } = useLeagueInvitations(leagueId)
  const sendInvitation = useSendInvitation()

  async function handleInvite(username) {
    try {
      await sendInvitation.mutateAsync({ leagueId, username })
      toast(`Invite sent to @${username}`, 'success')
      setQuery('')
    } catch (err) {
      toast(err.message || 'Failed to send invite', 'error')
    }
  }

  const pendingInvites = (invitations || []).filter((i) => i.status === 'pending')
  const pastInvites = (invitations || []).filter((i) => i.status !== 'pending')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border rounded-2xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        <h2 className="font-display text-xl mb-4">Invite Player</h2>

        {/* Search Input */}
        <div className="relative mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username..."
            className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            autoFocus
          />

          {/* Search Results Dropdown */}
          {query.length >= 2 && searchResults?.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleInvite(user.username)}
                  disabled={sendInvitation.isPending}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-bg-card-hover transition-colors disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-full bg-bg-primary flex items-center justify-center text-sm flex-shrink-0">
                    {user.avatar_emoji || user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{user.display_name || user.username}</div>
                    <div className="text-xs text-text-muted">@{user.username}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {query.length >= 2 && searchResults?.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 px-4 py-3 text-sm text-text-muted">
              No users found
            </div>
          )}
        </div>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">Pending</h3>
            <div className="space-y-1">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-secondary"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-bg-primary flex items-center justify-center text-xs flex-shrink-0">
                      {invite.user?.avatar_emoji || invite.user?.username?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm truncate">@{invite.user?.username}</span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES.pending}`}>
                    Pending
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past Invites */}
        {pastInvites.length > 0 && (
          <div>
            <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">History</h3>
            <div className="space-y-1">
              {pastInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-secondary opacity-60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-bg-primary flex items-center justify-center text-xs flex-shrink-0">
                      {invite.user?.avatar_emoji || invite.user?.username?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm truncate">@{invite.user?.username}</span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[invite.status]}`}>
                    {invite.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
