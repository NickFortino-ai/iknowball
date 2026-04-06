import { useEffect, useState, useCallback } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { usePickById, useGamePicks } from '../../hooks/usePicks'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import { useCreateFlex } from '../../hooks/useHotTakes'
import { generateShareCard } from '../../lib/shareCard'
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

  // Share state
  const [shareMode, setShareMode] = useState(false)
  const [cardBlob, setCardBlob] = useState(null)
  const [cardUrl, setCardUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!pickId) return
    setFlexing(false)
    setFlexText('')
    setShareMode(false)
    setCardBlob(null)
    if (cardUrl) URL.revokeObjectURL(cardUrl)
    setCardUrl(null)
    lockScroll()
    return () => unlockScroll()
  }, [pickId])

  useEffect(() => {
    return () => { if (cardUrl) URL.revokeObjectURL(cardUrl) }
  }, [cardUrl])

  const handleShare = useCallback(() => {
    if (!pick?.games) return
    const canvas = generateShareCard(pick.games, pick, gamePicksData?.totalCounts)
    canvas.toBlob((blob) => {
      if (cardUrl) URL.revokeObjectURL(cardUrl)
      setCardBlob(blob)
      setCardUrl(URL.createObjectURL(blob))
    }, 'image/png')
    setShareMode(true)
    setCopied(false)
  }, [pick, gamePicksData, cardUrl])

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

  async function handleCopyImage() {
    if (!cardBlob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })])
      setCopied(true)
      toast('Image copied!', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch { toast('Failed to copy image', 'error') }
  }

  function handleShareX() {
    const text = encodeURIComponent('I called it on I KNOW BALL 🔥 iknowball.club')
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank')
  }

  async function handleNativeShare() {
    if (!cardBlob) return
    try {
      const file = new File([cardBlob], 'iknowball-pick.png', { type: 'image/png' })
      await navigator.share({ text: 'I called it on I KNOW BALL 🔥 iknowball.club', files: [file] })
    } catch (err) {
      if (err.name !== 'AbortError') toast('Share failed', 'error')
    }
  }

  const game = pick?.games
  const isSettled = pick?.status === 'settled'
  const isCorrect = pick?.is_correct === true
  const isLost = pick?.is_correct === false
  const isLive = game?.status === 'live' || game?.status === 'in_progress'

  const canFlex = isOwn && isSettled && isCorrect
  const canShare = isOwn && isSettled && isCorrect // Only correct picks can be shared externally

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
          {canFlex && !flexing && !shareMode ? (
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
                        <Avatar user={sp.users} size="sm" />
                        <span className="text-sm text-text-primary truncate">{sp.users?.display_name || sp.users?.username}</span>
                      </div>
                      <span className="text-xs text-text-muted shrink-0">
                        {sp.picked_team === 'home' ? game?.home_team : game?.away_team}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Share Pick button + share card */}
            {canShare && !flexing && !shareMode && (
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent/10 text-accent text-sm font-semibold hover:bg-accent/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Share Pick
              </button>
            )}

            {shareMode && cardUrl && (
              <div className="space-y-3">
                <img src={cardUrl} alt="Share card" className="w-full rounded-xl" />
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={handleCopyImage} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-bg-primary border border-text-primary/20 text-xs font-medium text-text-secondary hover:border-text-primary/40 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={handleShareX} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-bg-primary border border-text-primary/20 text-xs font-medium text-text-secondary hover:border-text-primary/40 transition-colors">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    X
                  </button>
                  <button onClick={handleNativeShare} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-bg-primary border border-text-primary/20 text-xs font-medium text-text-secondary hover:border-text-primary/40 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                    Share
                  </button>
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
