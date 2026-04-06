// Generate share pick image (canvas) for external sharing
import { formatOdds } from './scoring'

const BG = '#0A0A0F'
const CARD_BG = '#141419'
const ACCENT = '#FF4D00'
const WHITE = '#FFFFFF'
const MUTED = '#71717A'
const BORDER = 'rgba(255, 255, 255, 0.2)'
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

export function generateShareCard(game, userPick, totalCounts) {
  const W = 600
  const PAD = 40

  // First pass: calculate required height based on content
  let calcY = 48 + 28 + 24 + 140
  if (userPick) {
    calcY += 28 + 72
    if (userPick.points_earned != null) calcY += 40
  }
  const totalCalc = (totalCounts?.home || 0) + (totalCounts?.away || 0)
  if (totalCalc > 0) {
    calcY += 8 + 20 + 12 + 14 + 24
  } else {
    calcY += 32
  }
  const H = calcY + 40

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = BG
  roundRect(ctx, 0, 0, W, H, 24)
  ctx.fill()

  // Glass edge border
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 2
  roundRect(ctx, 1, 1, W - 2, H - 2, 23)
  ctx.stroke()

  ctx.save()
  roundRect(ctx, 0, 0, W, H, 24)
  ctx.clip()

  // Top accent line
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, W, 3)

  // Brand
  let y = 48
  ctx.font = '700 28px Oswald, sans-serif'
  ctx.fillStyle = ACCENT
  ctx.textAlign = 'center'
  ctx.fillText('I KNOW BALL', W / 2, y)

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

  ctx.font = '700 18px Oswald, sans-serif'
  ctx.fillStyle = WHITE
  ctx.textAlign = 'right'
  ctx.fillText(game.away_team, midX - 60, scoreY)
  ctx.textAlign = 'left'
  ctx.fillText(game.home_team, midX + 60, scoreY)

  ctx.font = '400 14px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = MUTED
  ctx.textAlign = 'center'
  ctx.fillText('@', midX, scoreY)

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

    ctx.fillStyle = CARD_BG
    roundRect(ctx, PAD, y, W - PAD * 2, 56, 12)
    ctx.fill()

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

    ctx.font = '600 16px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = WHITE
    ctx.textAlign = 'left'
    ctx.fillText(`My Pick: ${pickedTeam}`, PAD + 64, y + 28 + 5)

    if (userPick.odds_at_pick != null) {
      const oddsStr = formatOdds(userPick.odds_at_pick)
      ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = MUTED
      ctx.textAlign = 'right'
      ctx.fillText(oddsStr, W - PAD - 16, y + 28 + 5)
    }

    y += 72

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
  if (totalCalc > 0) {
    y += 8
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    ctx.fillText('ALL PICKS', W / 2, y)

    y += 20
    const homePct = Math.round((totalCounts.home / totalCalc) * 100)
    const awayPct = 100 - homePct
    const barX = PAD
    const barW = W - PAD * 2
    const barH = 14

    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = WHITE
    ctx.fillText(`${game.away_team} ${awayPct}%`, barX, y)
    ctx.textAlign = 'right'
    ctx.fillText(`${homePct}% ${game.home_team}`, barX + barW, y)

    y += 12
    ctx.fillStyle = BORDER
    roundRect(ctx, barX, y, barW, barH, 7)
    ctx.fill()

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
  ctx.font = '700 15px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.fillText('iknowball.club', W / 2, H - 24)

  ctx.restore()
  return canvas
}
