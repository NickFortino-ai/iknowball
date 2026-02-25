import { useEffect } from 'react'
import { useParlay } from '../../hooks/useParlays'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import { formatOdds } from '../../lib/scoring'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickComments from '../social/PickComments'

export default function ParlayResultModal({ parlayId, onClose }) {
  const { data: parlay, isLoading } = useParlay(parlayId)
  const { session } = useAuth()
  const ownerId = parlay?.user_id
  const isOwn = ownerId && ownerId === session?.user?.id
  const { data: connData } = useConnectionStatus(!isOwn ? ownerId : null)
  const canComment = isOwn || connData?.status === 'connected'

  useEffect(() => {
    if (!parlayId) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [parlayId])

  if (!parlayId) return null

  const isWon = parlay?.is_correct === true
  const isLost = parlay?.is_correct === false
  const isPush = parlay?.is_correct === null && parlay?.status === 'settled'

  const borderColor = isWon ? 'border-correct' : isLost ? 'border-incorrect' : 'border-border'
  const badgeColor = isWon ? 'bg-correct/20 text-correct' : isLost ? 'bg-incorrect/20 text-incorrect' : 'bg-bg-secondary text-text-muted'
  const badgeLabel = isWon ? 'Won' : isLost ? 'Lost' : isPush ? 'Push' : ''

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative bg-bg-card border ${borderColor} w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto ${isWon ? 'parlay-win-glow' : ''}`}
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
        ) : !parlay ? (
          <p className="text-text-muted text-center">Parlay not found</p>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="text-text-primary font-semibold">
                {parlay.leg_count}-Leg Parlay
              </span>
              {badgeLabel && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                  {badgeLabel}
                </span>
              )}
              {parlay.points_earned != null && parlay.points_earned !== 0 && (
                <span className={`text-sm font-semibold ml-auto ${parlay.points_earned > 0 ? 'text-correct' : 'text-incorrect'}`}>
                  {parlay.points_earned > 0 ? '+' : ''}{parlay.points_earned} pts
                </span>
              )}
              {isPush && (
                <span className="text-sm text-text-muted ml-auto">0 pts</span>
              )}
            </div>

            {/* Legs */}
            <div className="space-y-2">
              {parlay.parlay_legs?.map((leg) => {
                const team = leg.picked_team === 'home' ? leg.games?.home_team : leg.games?.away_team
                const odds = leg.odds_at_lock ?? leg.odds_at_submission
                const legWon = leg.status === 'won'
                const legLost = leg.status === 'lost'
                const legPush = leg.status === 'push'

                return (
                  <div key={leg.id} className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-text-muted text-xs uppercase">
                        {leg.games?.sports?.name || ''}
                      </span>
                      <span className="text-text-primary font-medium truncate">{team}</span>
                      {odds != null && (
                        <span className="text-text-muted text-xs">{formatOdds(odds)}</span>
                      )}
                    </div>
                    <span className={`text-xs font-bold ${legWon ? 'text-correct' : legLost ? 'text-incorrect' : legPush ? 'text-text-muted' : ''}`}>
                      {legWon ? 'W' : legLost ? 'L' : legPush ? 'P' : ''}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Combined multiplier */}
            <div className="text-center text-xs text-text-muted pt-1">
              Combined: {Number(parlay.combined_multiplier).toFixed(2)}x
            </div>

            {/* Comments */}
            <PickComments targetType="parlay" targetId={parlayId} initialExpanded hideForm={!canComment} />
          </div>
        )}
      </div>
    </div>
  )
}
