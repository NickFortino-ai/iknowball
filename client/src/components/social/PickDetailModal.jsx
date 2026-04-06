import { useEffect, useState } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { usePickById, useGamePicks } from '../../hooks/usePicks'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import { useCreateFlex } from '../../hooks/useHotTakes'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickReactions from './PickReactions'
import PickComments from './PickComments'
import PickResultCard from '../picks/PickResultCard'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'

export default function PickDetailModal({ pickId, onClose }) {
  const { data: pick, isLoading } = usePickById(pickId)
  const { data: gamePicksData } = useGamePicks(pick?.game_id || null)
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
    setFlexing(false)
    setFlexText('')
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

  const game = pick?.games
  const isSettled = pick?.status === 'settled'
  const isCorrect = pick?.is_correct === true
  const isLost = pick?.is_correct === false
  const isLive = game?.status === 'live' || game?.status === 'in_progress'

  const canFlex = isOwn && isSettled && isCorrect

  const borderColor = isCorrect ? 'border-correct'
    : isLost ? 'border-incorrect'
    : isLive ? 'border-accent'
    : 'border-text-primary/20'

  const squadPicks = gamePicksData?.squadPicks || []
  const squadAway = squadPicks.filter((p) => p.picked_team === 'away')
  const squadHome = squadPicks.filter((p) => p.picked_team === 'home')

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative bg-bg-primary/90 backdrop-blur-md border ${borderColor} w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
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
          <p className="text-text-muted text-center">Pick not found</p>
        ) : (
          <div className="space-y-3">
            {/* Unified result card: matchup + pick + all picks bar */}
            <PickResultCard pick={pick} game={game} totalCounts={gamePicksData?.totalCounts} />

            {/* Your Squad section (own pick only, not shown when flexed to feed) */}
            {isOwn && squadPicks.length > 0 && (
              <div className="rounded-xl border border-text-primary/20 p-4">
                <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">Your Squad</h3>
                <div className="space-y-2">
                  {[...squadAway, ...squadHome].map((sp) => (
                    <div key={sp.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar user={sp} size="sm" />
                        <span className="text-sm text-text-primary truncate">{sp.display_name || sp.username}</span>
                      </div>
                      <span className="text-xs text-text-muted shrink-0">
                        {sp.picked_team === 'home' ? game?.home_team : game?.away_team}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reactions */}
            <PickReactions pickId={pickId} />

            {/* Comments */}
            <div className="rounded-xl border border-text-primary/20 p-4">
              <PickComments pickId={pickId} initialExpanded hideForm={!canComment} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
