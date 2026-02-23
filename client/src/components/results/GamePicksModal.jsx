import { useEffect, useState, useCallback } from 'react'
import { useGamePicks } from '../../hooks/usePicks'
import { formatOdds } from '../../lib/scoring'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'

const BG = '#0A0A0F'
const CARD_BG = '#141419'
const ACCENT = '#FF4D00'
const WHITE = '#FFFFFF'
const MUTED = '#71717A'
const BORDER = '#27272A'
const GREEN = '#22C55E'
const RED = '#EF4444'

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function generateShareCard(game, userPick, totalCounts) {
  const W = 600
  const H = 700
  const PAD = 40
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = BG
  roundRect(ctx, 0, 0, W, H, 24)
  ctx.fill()

  // Clip to rounded rect
  ctx.save()
  roundRect(ctx, 0, 0, W, H, 24)
  ctx.clip()

  // Subtle top accent line
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, W, 3)

  // Brand name
  let y = 48
  ctx.font = '700 28px Oswald, sans-serif'
  ctx.fillStyle = ACCENT
  ctx.textAlign = 'center'
  ctx.fillText('I KNOW BALL', W / 2, y)

  // Sport label
  y += 28
  ctx.font = '500 13px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = MUTED
  ctx.fillText(game.sports?.name?.toUpperCase() || 'GAME', W / 2, y)

  // Matchup card
  y += 24
  const cardY = y
  const cardH = 140
  ctx.fillStyle = CARD_BG
  roundRect(ctx, PAD, cardY, W - PAD * 2, cardH, 16)
  ctx.fill()
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  roundRect(ctx, PAD, cardY, W - PAD * 2, cardH, 16)
  ctx.stroke()

  const midX = W / 2
  const scoreY = cardY + 55

  // Away team
  ctx.font = '700 18px Oswald, sans-serif'
  ctx.fillStyle = WHITE
  ctx.textAlign = 'right'
  ctx.fillText(game.away_team, midX - 60, scoreY)

  // Home team
  ctx.textAlign = 'left'
  ctx.fillText(game.home_team, midX + 60, scoreY)

  // "at" divider
  ctx.font = '400 14px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = MUTED
  ctx.textAlign = 'center'
  ctx.fillText('@', midX, scoreY)

  // Score
  const awayScore = game.away_score ?? game.live_away_score
  const homeScore = game.home_score ?? game.live_home_score
  if (awayScore != null && homeScore != null) {
    const scY = scoreY + 36
    ctx.font = '700 32px Oswald, sans-serif'
    ctx.fillStyle = WHITE
    ctx.textAlign = 'right'
    ctx.fillText(String(awayScore), midX - 60, scY)
    ctx.textAlign = 'left'
    ctx.fillText(String(homeScore), midX + 60, scY)

    ctx.font = '400 13px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    ctx.fillText('FINAL', midX, scY)
  }

  // User's pick section
  y = cardY + cardH + 28
  if (userPick) {
    const isCorrect = userPick.is_correct === true
    const isPush = userPick.is_correct === null && userPick.status === 'settled'
    const pickedTeam = userPick.picked_team === 'home' ? game.home_team : game.away_team
    const icon = isPush ? '—' : isCorrect ? '✓' : '✗'
    const iconColor = isPush ? MUTED : isCorrect ? GREEN : RED

    // Pick row background
    ctx.fillStyle = CARD_BG
    roundRect(ctx, PAD, y, W - PAD * 2, 56, 12)
    ctx.fill()

    // Icon circle
    const circleX = PAD + 36
    const circleY = y + 28
    ctx.beginPath()
    ctx.arc(circleX, circleY, 16, 0, Math.PI * 2)
    ctx.fillStyle = iconColor + '20'
    ctx.fill()
    ctx.font = '700 18px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = iconColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(icon, circleX, circleY)
    ctx.textBaseline = 'alphabetic'

    // "My Pick: Team"
    ctx.font = '600 16px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = WHITE
    ctx.textAlign = 'left'
    ctx.fillText(`My Pick: ${pickedTeam}`, PAD + 64, y + 28 + 5)

    // Odds badge on the right
    if (userPick.odds_at_pick != null) {
      const oddsStr = formatOdds(userPick.odds_at_pick)
      ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = MUTED
      ctx.textAlign = 'right'
      ctx.fillText(oddsStr, W - PAD - 16, y + 28 + 5)
    }

    y += 72

    // Points earned
    if (userPick.points_earned != null) {
      const pts = userPick.points_earned
      const ptsColor = pts > 0 ? GREEN : pts < 0 ? RED : MUTED
      const ptsLabel = pts > 0 ? `+${pts} pts` : `${pts} pts`

      ctx.font = '700 36px Oswald, sans-serif'
      ctx.fillStyle = ptsColor
      ctx.textAlign = 'center'
      ctx.fillText(ptsLabel, W / 2, y + 10)
      y += 40
    }
  }

  // All Picks bar
  const total = (totalCounts?.home || 0) + (totalCounts?.away || 0)
  if (total > 0) {
    y += 8
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    ctx.letterSpacing = '1px'
    ctx.fillText('ALL PICKS', W / 2, y)

    y += 20
    const homePct = Math.round((totalCounts.home / total) * 100)
    const awayPct = 100 - homePct
    const barX = PAD
    const barW = W - PAD * 2
    const barH = 14

    // Labels
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = WHITE
    ctx.fillText(`${game.away_team} ${awayPct}%`, barX, y)
    ctx.textAlign = 'right'
    ctx.fillText(`${homePct}% ${game.home_team}`, barX + barW, y)

    y += 12
    // Bar bg
    ctx.fillStyle = BORDER
    roundRect(ctx, barX, y, barW, barH, 7)
    ctx.fill()

    // Away portion
    if (awayPct > 0) {
      ctx.fillStyle = ACCENT
      const aw = (awayPct / 100) * barW
      roundRect(ctx, barX, y, Math.max(aw, barH), barH, 7)
      ctx.fill()
    }

    y += barH + 24
  } else {
    y += 32
  }

  // Footer URL
  ctx.font = '500 13px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = MUTED
  ctx.textAlign = 'center'
  ctx.fillText('iknowball.club', W / 2, H - 24)

  ctx.restore()
  return canvas
}

export default function GamePicksModal({ game, userPick, onClose }) {
  const { data, isLoading } = useGamePicks(game?.id)
  const [shareMode, setShareMode] = useState(false)
  const [cardBlob, setCardBlob] = useState(null)
  const [cardUrl, setCardUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!game) return
    setShareMode(false)
    setCardBlob(null)
    if (cardUrl) URL.revokeObjectURL(cardUrl)
    setCardUrl(null)
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [game])

  useEffect(() => {
    return () => {
      if (cardUrl) URL.revokeObjectURL(cardUrl)
    }
  }, [cardUrl])

  const handleShare = useCallback(() => {
    const canvas = generateShareCard(game, userPick, data?.totalCounts)
    canvas.toBlob((blob) => {
      if (cardUrl) URL.revokeObjectURL(cardUrl)
      setCardBlob(blob)
      setCardUrl(URL.createObjectURL(blob))
    }, 'image/png')
    setShareMode(true)
    setCopied(false)
  }, [game, userPick, data, cardUrl])

  async function handleCopyImage() {
    if (!cardBlob) return
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': cardBlob }),
      ])
      setCopied(true)
      toast('Image copied!', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Failed to copy image', 'error')
    }
  }

  function handleShareX() {
    const text = encodeURIComponent('I called it on I KNOW BALL 🔥 iknowball.club')
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank')
  }

  async function handleNativeShare() {
    if (!cardBlob) return
    try {
      const file = new File([cardBlob], 'iknowball-pick.png', { type: 'image/png' })
      await navigator.share({
        text: 'I called it on I KNOW BALL 🔥 iknowball.club',
        files: [file],
      })
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast('Share failed', 'error')
      }
    }
  }

  if (!game) return null

  const totalPicks = (data?.totalCounts?.home || 0) + (data?.totalCounts?.away || 0)
  const homePct = totalPicks > 0 ? Math.round((data.totalCounts.home / totalPicks) * 100) : 0
  const awayPct = totalPicks > 0 ? 100 - homePct : 0

  const squadHome = (data?.squadPicks || []).filter((p) => p.picked_team === 'home')
  const squadAway = (data?.squadPicks || []).filter((p) => p.picked_team === 'away')

  const canShare = userPick?.status === 'settled' && !isLoading

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 pb-20 md:pb-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="font-display text-lg">{game.away_team} @ {game.home_team}</h2>
          <p className="text-xs text-text-muted">{game.sports?.name || 'Game'}</p>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* All Picks bar */}
            <div className="bg-bg-primary rounded-xl p-4 mb-5">
              <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">All Picks</h3>
              {totalPicks === 0 ? (
                <p className="text-sm text-text-muted text-center">No picks yet</p>
              ) : (
                <>
                  <div className="flex justify-between text-sm font-semibold mb-1">
                    <span>{game.away_team} ({awayPct}%)</span>
                    <span>{game.home_team} ({homePct}%)</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-border">
                    {awayPct > 0 && (
                      <div
                        className="bg-accent transition-all"
                        style={{ width: `${awayPct}%` }}
                      />
                    )}
                    {homePct > 0 && (
                      <div
                        className="bg-text-secondary transition-all"
                        style={{ width: `${homePct}%` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-text-muted mt-1">
                    <span>{data.totalCounts.away}</span>
                    <span>{data.totalCounts.home}</span>
                  </div>
                </>
              )}
            </div>

            {/* Your Squad */}
            <div className={canShare ? 'mb-4' : ''}>
              <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Your Squad</h3>
              {data?.squadPicks?.length > 0 ? (
                <div className="space-y-2">
                  {[...squadAway, ...squadHome].map((pick) => (
                    <div key={pick.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-8 h-8 rounded-full bg-bg-primary flex items-center justify-center text-sm shrink-0">
                          {pick.avatar_emoji || (pick.display_name || pick.username)?.[0]?.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {pick.display_name || pick.username}
                        </span>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        pick.picked_team === 'home'
                          ? 'bg-text-secondary/15 text-text-secondary'
                          : 'bg-accent/15 text-accent'
                      }`}>
                        {pick.picked_team === 'home' ? game.home_team : game.away_team}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-2">None of your squad picked this game</p>
              )}
            </div>

            {/* Share Button */}
            {canShare && (
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

            {/* Share Card + Options */}
            {shareMode && cardUrl && (
              <div className="mt-4 space-y-3">
                <img
                  src={cardUrl}
                  alt="Share card"
                  className="w-full rounded-xl"
                />
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleCopyImage}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-bg-primary border border-border text-xs font-medium text-text-secondary hover:border-border-hover transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                    {copied ? 'Copied!' : 'Copy Image'}
                  </button>
                  <button
                    onClick={handleShareX}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-bg-primary border border-border text-xs font-medium text-text-secondary hover:border-border-hover transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    Share to X
                  </button>
                  <button
                    onClick={handleNativeShare}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-bg-primary border border-border text-xs font-medium text-text-secondary hover:border-border-hover transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                    Share
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
