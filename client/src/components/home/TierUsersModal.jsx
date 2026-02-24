import { useState, useEffect } from 'react'
import { useTierUsers } from '../../hooks/useTierUsers'
import TierBadge from '../ui/TierBadge'
import LoadingSpinner from '../ui/LoadingSpinner'
import UserProfileModal from '../profile/UserProfileModal'

export default function TierUsersModal({ tier, onClose }) {
  const [profileUserId, setProfileUserId] = useState(null)
  const { data: users, isLoading } = useTierUsers(tier?.name)

  useEffect(() => {
    if (!tier) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [tier])

  if (!tier) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60" />
        <div
          className="relative bg-bg-card border border-border w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 pb-20 md:pb-6 max-h-[85vh] md:max-h-[75vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
          >
            &times;
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <TierBadge tier={tier.name} size="md" />
            <div>
              <div className="font-display text-lg">{tier.name}</div>
              <div className="text-xs text-text-muted">{tier.points} pts — {tier.desc}</div>
            </div>
          </div>

          {/* User count */}
          {!isLoading && users && (
            <div className="text-xs text-text-muted mb-3">
              {users.length} {users.length === 1 ? 'user' : 'users'}
            </div>
          )}

          {/* User list */}
          <div className="overflow-y-auto flex-1 -mx-2 px-2">
            {isLoading ? (
              <LoadingSpinner />
            ) : !users?.length ? (
              <p className="text-text-muted text-center text-sm py-8">No users in this tier yet</p>
            ) : (
              <div className="space-y-1">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setProfileUserId(user.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-primary transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-bg-primary flex items-center justify-center text-sm font-semibold shrink-0">
                      {(user.display_name || user.username)?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{user.display_name || user.username}</div>
                      <div className="text-xs text-text-muted truncate">@{user.username}</div>
                    </div>
                    <div className="text-sm font-display text-accent shrink-0">{user.total_points} pts</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {profileUserId && (
        <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </>
  )
}
