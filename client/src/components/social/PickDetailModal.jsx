import { useEffect, useState } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { usePickById } from '../../hooks/usePicks'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import { useCreateFlex } from '../../hooks/useHotTakes'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickReactions from './PickReactions'
import PickComments from './PickComments'
import { toast } from '../ui/Toast'

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
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
  const createFlex = useCreateFlex()
  const [flexing, setFlexing] = useState(false)
  const [flexText, setFlexText] = useState('')

  useEffect(() => {
    if (!pickId) return
    lockScroll()
    return () => unlockScroll()
  }, [pickId])

  if (!pickId) return null

  async function handleSubmitFlex() {
    try {
      await createFlex.mutateAsync({ content: flexText, pickId })
      toast('Flex posted to squad!', 'success')
      setFlexing(false)
      setFlexText('')
      onClose?.()
    } catch (err) {
      toast(err.message || 'Failed to flex', 'error')
    }
  }

  const canFlex = isOwn && pick?.status === 'settled' && pick?.is_correct === true

  const game = pick?.games
  const sport = game?.sports
  const pickedTeamName = pick?.picked_team === 'home' ? game?.home_team : game?.away_team
  const isSettled = pick?.status === 'settled'
  const isLive = game?.status === 'in_progress'
  const borderColor = isSettled
    ? pick?.is_correct ? 'border-correct' : 'border-incorrect'
    : isLive ? 'border-accent' : 'border-text-primary/20'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative bg-bg-primary/90 backdrop-blur-md border ${borderColor} w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar: flex button (left) + close button (right) */}
        <div className="flex items-center justify-between mb-3">
          {canFlex && !flexing ? (
            <button
              onClick={() => setFlexing(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:opacity-80 transition-opacity"
            >
              <img src="/flex-button.png" alt="" className="w-6 h-6 object-contain" />
              <span>Flex to Squad</span>
            </button>
          ) : <div />}
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none w-8 h-8 flex items-center justify-center"
          >
            &times;
          </button>
        </div>

        {/* Flex composer */}
        {flexing && (
          <div className="mb-4">
            <textarea
              value={flexText}
              onChange={(e) => setFlexText(e.target.value)}
              placeholder="Let them know!"
              rows={2}
              className="w-full bg-bg-primary/50 border border-accent rounded-lg px-3 py-2 text-sm font-semibold text-white placeholder-text-muted focus:outline-none resize-none"
              autoFocus
            />
            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={() => { setFlexing(false); setFlexText('') }}
                className="text-xs text-text-muted hover:text-text-secondary px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFlex}
                disabled={createFlex.isPending}
                className="text-xs font-semibold bg-accent text-white px-4 py-1.5 rounded-lg hover:bg-accent-hover disabled:opacity-50"
              >
                {createFlex.isPending ? 'Posting...' : 'Flex'}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner />
        ) : !pick ? (
          <p className="text-text-muted text-center">Pick not found</p>
        ) : (
          <div className="space-y-3">
            {/* Sport badge */}
            {sport && (
              <span className="text-xs text-text-muted uppercase tracking-wider">
                {SPORT_LABELS[sport.key] || sport.name}
              </span>
            )}

            {/* Game summary */}
            <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4">
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
            <div className="rounded-xl border border-text-primary/20 p-4">
              <PickComments pickId={pickId} initialExpanded hideForm={!canComment} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
