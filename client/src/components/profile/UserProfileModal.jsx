import { useUserProfile } from '../../hooks/useUserProfile'
import { getTier } from '../../lib/scoring'
import TierBadge from '../ui/TierBadge'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function UserProfileModal({ userId, onClose }) {
  const { data: user, isLoading } = useUserProfile(userId)

  if (!userId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border rounded-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        {isLoading ? (
          <LoadingSpinner />
        ) : !user ? (
          <p className="text-text-muted text-center">User not found</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-bg-primary flex items-center justify-center text-2xl">
                {user.avatar_emoji || (user.display_name || user.username)?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-display text-xl truncate">{user.display_name || user.username}</div>
                <div className="text-text-muted text-sm">@{user.username}</div>
              </div>
            </div>

            {/* Bio */}
            {user.bio && (
              <p className="text-text-secondary text-sm mb-4">{user.bio}</p>
            )}

            {/* Sports Interests */}
            {user.sports_interests?.length > 0 && (
              <div className="flex items-center gap-1.5 mb-4">
                {user.sports_interests.map((emoji, i) => (
                  <span key={i} className="text-lg">{emoji}</span>
                ))}
              </div>
            )}

            {/* Tier + Points + Rank */}
            <div className="flex items-center gap-3 mb-4">
              <TierBadge tier={getTier(user.total_points).name} size="md" />
              <span className="font-display text-2xl text-accent">{Math.max(0, user.total_points)} pts</span>
              <span className="text-text-muted text-sm ml-auto">
                Rank #{user.rank} of {user.total_users}
              </span>
            </div>

            {/* Pick Record */}
            <div className="bg-bg-primary rounded-xl p-4 mb-4">
              <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Pick Record</h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <div className="font-display text-xl text-text-primary">{user.record.total}</div>
                  <div className="text-xs text-text-muted">Total</div>
                </div>
                <div>
                  <div className="font-display text-xl text-correct">{user.record.wins}</div>
                  <div className="text-xs text-text-muted">Wins</div>
                </div>
                <div>
                  <div className="font-display text-xl text-incorrect">{user.record.losses}</div>
                  <div className="text-xs text-text-muted">Losses</div>
                </div>
                <div>
                  <div className="font-display text-xl text-text-primary">
                    {user.record.total > 0
                      ? `${((user.record.wins / user.record.total) * 100).toFixed(0)}%`
                      : '—'}
                  </div>
                  <div className="text-xs text-text-muted">Win %</div>
                </div>
              </div>
            </div>

            {/* Sport Breakdown */}
            {user.sport_stats?.length > 0 && (
              <div>
                <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">By Sport</h3>
                <div className="space-y-2">
                  {user.sport_stats.map((stat) => (
                    <div key={stat.id} className="bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm">{stat.sports?.name}</span>
                        <span className="text-text-muted text-xs ml-2">
                          {stat.correct_picks}W-{stat.total_picks - stat.correct_picks}L
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-muted">Streak: {stat.current_streak}</span>
                        <span className="text-accent font-semibold text-sm">{stat.total_points} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Member since */}
            <div className="text-text-muted text-xs text-center mt-4">
              Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
