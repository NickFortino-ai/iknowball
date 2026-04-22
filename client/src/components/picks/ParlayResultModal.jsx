import { useEffect, useState } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useParlay } from '../../hooks/useParlays'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import { useCreateFlex } from '../../hooks/useHotTakes'
import { formatOdds } from '../../lib/scoring'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickComments from '../social/PickComments'
import { toast } from '../ui/Toast'

export default function ParlayResultModal({ parlayId, onClose }) {
  const { data: parlay, isLoading } = useParlay(parlayId)
  const { session } = useAuth()
  const ownerId = parlay?.user_id
  const isOwn = ownerId && ownerId === session?.user?.id
  const { data: connData } = useConnectionStatus(!isOwn ? ownerId : null)
  const canComment = isOwn || connData?.status === 'connected'
  const createFlex = useCreateFlex()
  const [flexing, setFlexing] = useState(false)
  const [flexText, setFlexText] = useState('')

  useEffect(() => {
    if (!parlayId) return
    lockScroll()
    return () => unlockScroll()
  }, [parlayId])

  if (!parlayId) return null

  async function handleSubmitFlex() {
    try {
      await createFlex.mutateAsync({ content: flexText, parlayId })
      toast('Flex posted to squad!', 'success')
      setFlexing(false)
      setFlexText('')
      onClose?.()
    } catch (err) {
      toast(err.message || 'Failed to flex', 'error')
    }
  }

  const canFlex = isOwn && parlay?.status === 'settled' && parlay?.is_correct === true

  const isWon = parlay?.is_correct === true
  const isLost = parlay?.is_correct === false
  const isPush = parlay?.is_correct === null && parlay?.status === 'settled'

  const borderColor = isWon ? 'border-correct' : isLost ? 'border-incorrect' : 'border-border'
  const badgeColor = isWon ? 'text-correct' : isLost ? 'text-incorrect' : 'text-text-muted'
  const badgeLabel = isWon ? 'Won' : isLost ? 'Lost' : isPush ? 'Push' : ''

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative bg-bg-primary/90 backdrop-blur-md border ${borderColor} w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[85vh] overflow-y-auto ${isWon ? 'parlay-win-glow' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar: flex button + close */}
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
              <button onClick={() => { setFlexing(false); setFlexText('') }} className="text-xs text-text-muted hover:text-text-secondary px-3 py-1.5">Cancel</button>
              <button onClick={handleSubmitFlex} disabled={createFlex.isPending} className="text-xs font-semibold bg-accent text-white px-4 py-1.5 rounded-lg hover:bg-accent-hover disabled:opacity-50">
                {createFlex.isPending ? 'Posting...' : 'Flex'}
              </button>
            </div>
          </div>
        )}

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
