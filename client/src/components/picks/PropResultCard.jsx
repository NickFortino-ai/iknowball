import { formatOdds } from '../../lib/scoring'

// Reusable prop-pick result display: matchup + headshot + live progress + consensus.
// Used in PropDetailModal (and any future feed cards). Mirrors PickResultCard.
export default function PropResultCard({ pick }) {
  if (!pick) return null

  const prop = pick.player_props || {}
  const game = prop.games || {}
  const sport = game.sports || {}

  const isPostponed = game.status === 'postponed'
  const isLive = !isPostponed && (game.status === 'live' || game.status === 'in_progress')
  const isSettled = !isPostponed && pick.status === 'settled'
  const isCorrect = !isPostponed && pick.is_correct === true
  const isLost = !isPostponed && pick.is_correct === false
  const isPush = !isPostponed && pick.is_correct === null && pick.status === 'settled'

  const borderColor = isPostponed ? 'border-yellow-500'
    : isCorrect ? 'border-correct'
    : isLost ? 'border-incorrect'
    : isLive ? 'border-accent'
    : 'border-text-primary/20'

  const headshot = prop.player_headshot_url
  const line = prop.line
  const side = pick.picked_side

  // Live in-game stat (set server-side by enrichLockedPicksWithLiveStats when locked).
  // For settled picks we prefer the prop's resolved actual_value.
  const liveValue = pick.live_stat
  const settledValue = prop.actual_value
  const currentValue = isSettled ? settledValue : liveValue
  const hasCurrent = currentValue != null && line != null

  // "On pace" framing relative to the line + picked side.
  let trackingColor = 'text-text-muted'
  let trackingLabel = null
  if (hasCurrent && (isLive || isSettled)) {
    const numeric = Number(currentValue)
    const diff = numeric - Number(line)
    const winningOver = side === 'over' && numeric > Number(line)
    const winningUnder = side === 'under' && numeric < Number(line)
    const tied = numeric === Number(line)
    if (winningOver || winningUnder) trackingColor = 'text-correct'
    else if (tied) trackingColor = 'text-text-muted'
    else trackingColor = 'text-incorrect'

    if (side === 'over') {
      const remaining = Math.max(0, Number(line) - numeric)
      // Round to two decimals only when needed
      const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
      if (numeric > Number(line)) trackingLabel = `+${fmt(diff)} over line`
      else if (numeric === Number(line)) trackingLabel = `at the line`
      else trackingLabel = `needs ${fmt(remaining)} more`
    } else {
      const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
      if (numeric < Number(line)) trackingLabel = `${fmt(Math.abs(diff))} to spare`
      else if (numeric === Number(line)) trackingLabel = `at the line`
      else trackingLabel = `${fmt(diff)} over line`
    }
  }

  // Consensus
  const counts = pick.totalCounts || { over: 0, under: 0 }
  const total = (counts.over || 0) + (counts.under || 0)
  const overPct = total > 0 ? Math.round(((counts.over || 0) / total) * 100) : 0
  const underPct = total > 0 ? 100 - overPct : 0

  const ptsColor = pick.points_earned > 0 ? 'text-correct'
    : pick.points_earned < 0 ? 'text-incorrect'
    : 'text-text-muted'

  const homeScore = game.home_score
  const awayScore = game.away_score
  const hasScores = awayScore != null && homeScore != null

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
      {/* Header: sport + status pill */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-xs text-text-muted uppercase tracking-wider">{sport.name || ''}</span>
        <span className={`text-xs font-semibold ${
          isPostponed ? 'text-yellow-500'
          : isSettled ? 'text-text-muted'
          : isLive ? 'text-accent'
          : 'text-text-muted'
        }`}>
          {isPostponed ? 'POSTPONED' : isSettled ? 'FINAL' : isLive ? 'LIVE' : ''}
        </span>
      </div>

      {/* Player row */}
      <div className="px-4 pb-4 flex items-center gap-3">
        {headshot ? (
          <img
            src={headshot}
            alt={prop.player_name || ''}
            className="w-16 h-16 rounded-full object-cover bg-bg-secondary shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-bg-secondary shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-text-primary truncate">{prop.player_name}</div>
          <div className="text-sm text-text-secondary">
            {line} {prop.market_label}
          </div>
          {game.away_team && game.home_team && (
            <div className="text-xs text-text-muted truncate mt-0.5">
              {game.away_team}{hasScores ? ` ${awayScore}` : ''} @ {game.home_team}{hasScores ? ` ${homeScore}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Live / settled stat tracker */}
      {hasCurrent && (
        <div className="border-t border-text-primary/10 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs text-text-muted uppercase tracking-wider">
              {isSettled ? 'Final' : 'Current'}
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={`text-2xl font-display font-bold ${trackingColor}`}>{currentValue}</span>
              {trackingLabel && (
                <span className={`text-xs ${trackingColor} truncate`}>{trackingLabel}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Picked side row */}
      <div className="border-t border-text-primary/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {(isPostponed || isPush || isCorrect || isLost) && (
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                isPostponed ? 'text-yellow-500'
                : isCorrect ? 'text-correct'
                : isLost ? 'text-incorrect'
                : 'text-text-muted'
              }`}>
                {isPostponed ? '⏸' : isPush ? '—' : isCorrect ? '✓' : '✗'}
              </span>
            )}
            <span className="text-sm text-text-secondary">Picked</span>
            <span className="text-sm font-semibold text-text-primary capitalize">{side}</span>
          </div>
          {pick.odds_at_pick != null && (
            <span className="text-xs text-text-muted shrink-0">{formatOdds(pick.odds_at_pick)}</span>
          )}
        </div>
        {isSettled && pick.points_earned != null && (
          <div className={`text-center text-lg font-display font-bold mt-2 ${ptsColor}`}>
            {pick.points_earned > 0 ? '+' : ''}{pick.points_earned} pts
          </div>
        )}
      </div>

      {/* All Picks consensus bar */}
      {total > 0 && (
        <div className="border-t border-text-primary/10 px-4 py-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider text-center mb-2">All Picks</div>
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span className="text-text-primary">Over {overPct}%</span>
            <span className="text-text-primary text-right">{underPct}% Under</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-bg-primary/50">
            {overPct > 0 && <div className="bg-accent" style={{ width: `${overPct}%` }} />}
            {underPct > 0 && <div className="bg-text-secondary/50" style={{ width: `${underPct}%` }} />}
          </div>
          <div className="flex justify-between text-[10px] text-text-muted mt-1">
            <span>{counts.over || 0}</span>
            <span>{counts.under || 0}</span>
          </div>
        </div>
      )}
    </div>
  )
}
