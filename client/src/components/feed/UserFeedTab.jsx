import { useState, useEffect } from 'react'
import { useSearchUsers } from '../../hooks/useInvitations'
import { useConnections } from '../../hooks/useConnections'
import { useUserProfile } from '../../hooks/useUserProfile'
import Avatar from '../ui/Avatar'
import TierBadge from '../ui/TierBadge'
import ActivityFeed from './ActivityFeed'

export default function UserFeedTab({ onUserTap, initialUserId }) {
  const [selectedUser, setSelectedUser] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [subFilter, setSubFilter] = useState('all')
  const [squadExpanded, setSquadExpanded] = useState(false)

  const { data: searchResults } = useSearchUsers(searchQuery)
  const { data: connections } = useConnections()

  // Auto-select user from initialUserId (e.g. deep-link from profile modal)
  const { data: initialUser } = useUserProfile(!selectedUser ? initialUserId : null)
  useEffect(() => {
    if (initialUser && !selectedUser) {
      setSelectedUser(initialUser)
    }
  }, [initialUser])

  function selectUser(user) {
    setSelectedUser(user)
    setSearchQuery('')
    setSubFilter('all')
  }

  function clearUser() {
    setSelectedUser(null)
    setSubFilter('all')
  }

  if (selectedUser) {
    return (
      <div>
        {/* Header bar */}
        <div className="bg-bg-card border border-border rounded-xl px-4 py-3 mb-3 flex items-center gap-3">
          <button onClick={() => onUserTap?.(selectedUser.user_id || selectedUser.id)}>
            <Avatar user={selectedUser} size="lg" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{selectedUser.display_name || selectedUser.username}</div>
            <div className="text-xs text-text-muted">@{selectedUser.username}</div>
          </div>
          <button
            onClick={clearUser}
            className="text-xs font-semibold text-text-muted hover:text-text-secondary transition-colors"
          >
            Clear
          </button>
        </div>

        {/* All / Hot Takes toggle */}
        <div className="flex gap-1 mb-3">
          {[
            { key: 'all', label: 'All' },
            { key: 'hot_takes', label: 'Hot Takes' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setSubFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                subFilter === f.key ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Feed */}
        <ActivityFeed
          onUserTap={onUserTap}
          scope={subFilter === 'hot_takes' ? 'user_hot_takes' : 'user_highlights'}
          targetUserId={selectedUser.user_id || selectedUser.id}
          targetUserName={selectedUser.display_name || selectedUser.username}
        />
      </div>
    )
  }

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by username..."
          className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
        />
        {searchQuery.length >= 2 && searchResults?.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
            {searchResults.map((user) => (
              <button
                key={user.id}
                onClick={() => selectUser(user)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-bg-card-hover transition-colors"
              >
                <Avatar user={user} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{user.display_name || user.username}</div>
                  <div className="text-xs text-text-muted">@{user.username}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {searchQuery.length >= 2 && searchResults?.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 px-4 py-3 text-sm text-text-muted">
            No users found
          </div>
        )}
      </div>

      {/* My Squad */}
      {connections?.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setSquadExpanded(!squadExpanded)}
            className="flex items-center gap-1.5 text-xs text-text-muted uppercase tracking-wider mb-2"
          >
            My Squad ({connections.length})
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${squadExpanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {squadExpanded && (
            <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
              {[...connections].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).map((conn) => (
                <button
                  key={conn.connection_id}
                  onClick={() => selectUser(conn)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 border-b border-border last:border-b-0 hover:bg-bg-card-hover transition-colors"
                >
                  <Avatar user={conn} size="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{conn.display_name || conn.username}</div>
                    <div className="text-xs text-text-muted">@{conn.username}</div>
                  </div>
                  <TierBadge tier={conn.tier} size="xs" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
        <div className="text-2xl mb-2">{'\uD83D\uDD0D'}</div>
        <div className="text-sm text-text-primary font-medium mb-1">Browse user feeds</div>
        <div className="text-xs text-text-muted">
          Search for a user or tap a squad member to see their feed.
        </div>
      </div>
    </div>
  )
}
