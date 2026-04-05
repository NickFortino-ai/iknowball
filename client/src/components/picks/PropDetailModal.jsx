import { useEffect } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { usePropPick } from '../../hooks/useProps'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickComments from '../social/PickComments'

export default function PropDetailModal({ propPickId, onClose }) {
  const { data: pick, isLoading } = usePropPick(propPickId)
  const { session } = useAuth()
  const ownerId = pick?.user_id
  const isOwn = ownerId && ownerId === session?.user?.id
  const { data: connData } = useConnectionStatus(!isOwn ? ownerId : null)
  const canComment = isOwn || connData?.status === 'connected'

  useEffect(() => {
    if (!propPickId) return
    lockScroll()
    return () => unlockScroll()
  }, [propPickId])

  if (!propPickId) return null

  const prop = pick?.player_props
  const game = prop?.games
  const sport = game?.sports
  const isSettled = pick?.status === 'settled'
  const isLive = game?.status === 'in_progress'
  const borderColor = isSettled
    ? pick?.is_correct ? 'border-correct' : pick?.is_correct === false ? 'border-incorrect' : 'border-text-primary/20'
    : isLive ? 'border-accent' : 'border-text-primary/20'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative bg-bg-primary/90 backdrop-blur-md border ${borderColor} w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-text-muted hover:text-text-primary text-xl leading-none p-3"
        >
          &times;
        </button>

        {isLoading ? (
          <LoadingSpinner />
        ) : !pick ? (
          <p className="text-text-muted text-center">Prop pick not found</p>
        ) : (
          <div className="space-y-4">
            {/* Sport badge */}
            {sport && (
              <span className="text-xs text-text-muted uppercase tracking-wider">
                {sport.name}
              </span>
            )}

            {/* Prop summary */}
            <div className="bg-bg-primary rounded-xl p-4">
              <div className="text-sm font-semibold mb-1">
                {prop?.player_name} — {prop?.line} {prop?.market_label}
              </div>
              {game && (
                <div className="text-xs text-text-muted mb-2">
                  {game.away_team} @ {game.home_team}
                </div>
              )}
              <div className="text-xs text-text-secondary">
                Picked: <span className="font-semibold text-text-primary">{pick.picked_side}</span>
              </div>
              {isSettled && (
                <div className={`text-sm font-semibold mt-2 ${
                  pick.points_earned > 0 ? 'text-correct' : pick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
                }`}>
                  {pick.is_correct ? 'W' : pick.is_correct === false ? 'L' : 'Push'} &middot; {pick.points_earned > 0 ? '+' : ''}{pick.points_earned} pts
                </div>
              )}
            </div>

            {/* Comments */}
            <PickComments targetType="prop" targetId={propPickId} initialExpanded hideForm={!canComment} />
          </div>
        )}
      </div>
    </div>
  )
}
