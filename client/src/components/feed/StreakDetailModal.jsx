import { useEffect } from 'react'
import { useStreakDetail } from '../../hooks/useConnections'
import LoadingSpinner from '../ui/LoadingSpinner'

function getStreakTier(length) {
  if (length >= 10) return 'legendary'
  if (length >= 5) return 'hot'
  return 'normal'
}

function formatGameDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function StreakDetailModal({ streakId, onClose }) {
  const { data, isLoading } = useStreakDetail(streakId)

  useEffect(() => {
    if (!streakId) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [streakId])

  if (!streakId) return null

  const tier = data ? getStreakTier(data.streakEvent.streak_length) : 'normal'
  const borderColor = tier === 'legendary' ? 'border-orange-500' : tier === 'hot' ? 'border-orange-400' : 'border-border'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative bg-bg-card border ${borderColor} w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto ${tier === 'legendary' ? 'streak-fire-glow' : ''}`}
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
        ) : !data ? (
          <p className="text-text-muted text-center">Streak not found</p>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <span className={tier === 'legendary' ? 'text-4xl' : tier === 'hot' ? 'text-3xl' : 'text-xl'}>
                {'\uD83D\uDD25'}
              </span>
              <div>
                <div className={`font-bold text-orange-400 ${
                  tier === 'legendary' ? 'text-2xl' : tier === 'hot' ? 'text-xl' : 'text-lg'
                }`}>
                  {data.streakEvent.streak_length} Win Streak
                </div>
                <div className="text-xs text-text-muted">
                  {data.streakEvent.sports?.name || 'Unknown Sport'}
                </div>
              </div>
            </div>

            {/* Status */}
            <div className={`text-sm font-medium px-3 py-2 rounded-lg ${
              data.isActive
                ? 'bg-correct/10 text-correct'
                : 'bg-bg-secondary text-text-muted'
            }`}>
              {data.isActive
                ? 'Streak is still active!'
                : 'Streak no longer active'}
            </div>

            {/* Picks list */}
            <div className="space-y-2">
              {data.picks.map((pick, i) => {
                const team = pick.picked_team === 'home' ? pick.games.home_team : pick.games.away_team
                const opponent = pick.picked_team === 'home' ? pick.games.away_team : pick.games.home_team

                return (
                  <div key={pick.id} className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-text-muted text-xs w-5 text-center shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="text-text-primary font-medium truncate">{team}</div>
                        <div className="text-text-muted text-xs truncate">vs {opponent}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-text-muted text-xs">{formatGameDate(pick.games.starts_at)}</span>
                      {pick.points_earned != null && (
                        <span className="text-correct text-xs font-semibold">
                          +{pick.points_earned}
                        </span>
                      )}
                      <span className="text-correct">&#10003;</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
