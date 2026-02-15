import { useState } from 'react'
import {
  useConnections,
  usePendingConnectionRequests,
  useConnectionActivity,
  useSendConnectionRequest,
  useAcceptConnectionRequest,
  useDeclineConnectionRequest,
} from '../hooks/useConnections'
import { useSearchUsers } from '../hooks/useInvitations'
import TierBadge from '../components/ui/TierBadge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import UserProfileModal from '../components/profile/UserProfileModal'
import { toast } from '../components/ui/Toast'
import InfoTooltip from '../components/ui/InfoTooltip'

const ACTIVITY_EMOJI = {
  underdog_win: '\uD83C\uDFAF',
  hot_streak: '\uD83D\uDD25',
  tier_achievement: '\u2B50',
}

export default function ConnectionsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)

  const { data: connections, isLoading } = useConnections()
  const { data: pending } = usePendingConnectionRequests()
  const { data: activity } = useConnectionActivity()
  const { data: searchResults } = useSearchUsers(searchQuery)
  const sendRequest = useSendConnectionRequest()
  const acceptRequest = useAcceptConnectionRequest()
  const declineRequest = useDeclineConnectionRequest()

  const connectedUserIds = new Set((connections || []).map((c) => c.user_id))

  async function handleSendRequest(username) {
    try {
      await sendRequest.mutateAsync(username)
      toast(`Connection request sent to @${username}`, 'success')
      setSearchQuery('')
    } catch (err) {
      toast(err.message || 'Failed to send request', 'error')
    }
  }

  async function handleAccept(connectionId) {
    try {
      await acceptRequest.mutateAsync(connectionId)
      toast('Connection accepted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to accept', 'error')
    }
  }

  async function handleDecline(connectionId) {
    try {
      await declineRequest.mutateAsync(connectionId)
      toast('Request declined', 'info')
    } catch (err) {
      toast(err.message || 'Failed to decline', 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl mb-6">Squad<InfoTooltip text="Your connections are the users you're linked with. Anyone you've been in a league with is automatically added. You can also search for users by username and send a connection request. Your connections appear first when inviting people to leagues, making it easy to get your people together fast." /></h1>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Squad<InfoTooltip text="Your connections are the users you're linked with. Anyone you've been in a league with is automatically added. You can also search for users by username and send a connection request. Your connections appear first when inviting people to leagues, making it easy to get your people together fast." /></h1>

      {/* Pending Requests */}
      {pending?.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">Pending Requests</h2>
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-bg-primary flex items-center justify-center text-sm flex-shrink-0">
                    {req.requester?.avatar_emoji || req.requester?.username?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {req.requester?.display_name || req.requester?.username}
                    </div>
                    <div className="text-xs text-text-muted">@{req.requester?.username}</div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-3">
                  <button
                    onClick={() => handleAccept(req.id)}
                    disabled={acceptRequest.isPending}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecline(req.id)}
                    disabled={declineRequest.isPending}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-bg-secondary text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Connection */}
      <div className="mb-6">
        <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">Add Connection</h2>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username..."
            className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />

          {searchQuery.length >= 2 && searchResults?.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
              {searchResults.map((user) => {
                const isConnected = connectedUserIds.has(user.id)
                return (
                  <div
                    key={user.id}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-bg-card-hover transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-bg-primary flex items-center justify-center text-sm flex-shrink-0">
                      {user.avatar_emoji || user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{user.display_name || user.username}</div>
                      <div className="text-xs text-text-muted">@{user.username}</div>
                    </div>
                    {isConnected ? (
                      <span className="text-xs text-text-muted font-medium flex-shrink-0">Connected</span>
                    ) : (
                      <button
                        onClick={() => handleSendRequest(user.username)}
                        disabled={sendRequest.isPending}
                        className="py-1 px-3 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {searchQuery.length >= 2 && searchResults?.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 px-4 py-3 text-sm text-text-muted">
              No users found
            </div>
          )}
        </div>
      </div>

      {/* My Connections */}
      <div className="mb-6">
        <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">
          My Connections {connections?.length > 0 && `(${connections.length})`}
        </h2>
        {!connections?.length ? (
          <div className="bg-bg-card border border-border rounded-xl px-4 py-8 text-center text-text-muted text-sm">
            No connections yet. Join a league or search for friends above!
          </div>
        ) : (
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            {connections.map((conn) => (
              <div
                key={conn.connection_id}
                onClick={() => setSelectedUserId(conn.user_id)}
                className="px-4 py-3 flex items-center gap-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-bg-card-hover transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-bg-primary flex items-center justify-center text-base flex-shrink-0">
                  {conn.avatar_emoji || conn.username[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{conn.display_name || conn.username}</div>
                  <div className="text-xs text-text-muted">@{conn.username}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {conn.current_streak > 0 && (
                    <span className="text-xs text-text-muted flex items-center gap-0.5">
                      <span className="text-orange-400">{'\uD83D\uDD25'}</span>
                      {conn.current_streak}
                    </span>
                  )}
                  <TierBadge tier={conn.tier} size="xs" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div>
        <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">Recent Activity</h2>
        {!activity?.length ? (
          <div className="bg-bg-card border border-border rounded-xl px-4 py-8 text-center text-text-muted text-sm">
            No recent activity from your connections
          </div>
        ) : (
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            {activity.map((item, i) => (
              <div
                key={`${item.type}-${item.userId}-${i}`}
                className="px-4 py-3 border-b border-border last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0">{ACTIVITY_EMOJI[item.type]}</span>
                  <p className="text-sm">
                    <button
                      onClick={() => setSelectedUserId(item.userId)}
                      className="font-semibold text-accent hover:underline"
                    >
                      {item.username}
                    </button>
                    {' '}{item.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UserProfileModal
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  )
}
