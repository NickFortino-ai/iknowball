import { useEffect, useState } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { usePropPick } from '../../hooks/useProps'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import { useCreateFlex } from '../../hooks/useHotTakes'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickComments from '../social/PickComments'
import { toast } from '../ui/Toast'

export default function PropDetailModal({ propPickId, onClose }) {
  const { data: pick, isLoading } = usePropPick(propPickId)
  const { session } = useAuth()
  const ownerId = pick?.user_id
  const isOwn = ownerId && ownerId === session?.user?.id
  const { data: connData } = useConnectionStatus(!isOwn ? ownerId : null)
  const canComment = isOwn || connData?.status === 'connected'
  const createFlex = useCreateFlex()
  const [flexing, setFlexing] = useState(false)
  const [flexText, setFlexText] = useState('')

  useEffect(() => {
    if (!propPickId) return
    lockScroll()
    return () => unlockScroll()
  }, [propPickId])

  if (!propPickId) return null

  async function handleSubmitFlex() {
    try {
      await createFlex.mutateAsync({ content: flexText, propPickId })
      toast('Flex posted to squad!', 'success')
      setFlexing(false)
      setFlexText('')
      onClose?.()
    } catch (err) {
      toast(err.message || 'Failed to flex', 'error')
    }
  }

  const canFlex = isOwn && pick?.status === 'settled' && pick?.is_correct === true

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
