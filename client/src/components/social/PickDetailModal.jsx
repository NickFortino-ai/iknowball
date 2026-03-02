import { useEffect } from 'react'
import { usePickById } from '../../hooks/usePicks'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickReactions from './PickReactions'
import PickComments from './PickComments'

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
}

export default function PickDetailModal({ pickId, onClose }) {
  const { data: pick, isLoading } = usePickById(pickId)
  const { session } = useAuth()
  const ownerId = pick?.user_id
  const isOwn = ownerId && ownerId === session?.user?.id
  const { data: connData } = useConnectionStatus(!isOwn ? ownerId : null)
  const canComment = isOwn || connData?.status === 'connected'

  useEffect(() => {
    if (!pickId) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [pickId])

  if (!pickId) return null

  const game = pick?.games
  const sport = game?.sports
  const pickedTeamName = pick?.picked_team === 'home' ? game?.home_team : game?.away_team
  const isSettled = pick?.status === 'settled'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto"
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
        ) : !pick ? (
          <p className="text-text-muted text-center">Pick not found</p>
        ) : (
          <div className="space-y-4">
            {/* Sport badge */}
            {sport && (
              <span className="text-xs text-text-muted uppercase tracking-wider">
                {SPORT_LABELS[sport.key] || sport.name}
              </span>
            )}

            {/* Game summary */}
            <div className="bg-bg-primary rounded-xl p-4">
              <div className="text-sm font-semibold mb-1">
                {game?.away_team} @ {game?.home_team}
              </div>
              {isSettled && game?.home_score != null && (
                <div className="text-xs text-text-muted mb-2">
                  Final: {game.away_team} {game.away_score} - {game.home_team} {game.home_score}
                </div>
              )}
              <div className="text-xs text-text-secondary">
                Picked: <span className="font-semibold text-text-primary">{pickedTeamName}</span>
                {pick.odds_at_submission && (
                  <span className="text-text-muted ml-2">
                    ({pick.odds_at_submission > 0 ? '+' : ''}{pick.odds_at_submission})
                  </span>
                )}
              </div>
              {isSettled && (
                <div className={`text-sm font-semibold mt-2 ${
                  pick.points_earned > 0 ? 'text-correct' : pick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
                }`}>
                  {pick.is_correct ? 'W' : 'L'} &middot; {pick.points_earned > 0 ? '+' : ''}{pick.points_earned} pts{pick.multiplier > 1 && ` (${pick.multiplier}x)`}
                </div>
              )}
            </div>

            {/* Reactions */}
            <PickReactions pickId={pickId} />

            {/* Comments (pre-expanded) */}
            <PickComments pickId={pickId} initialExpanded hideForm={!canComment} />
          </div>
        )}
      </div>
    </div>
  )
}
