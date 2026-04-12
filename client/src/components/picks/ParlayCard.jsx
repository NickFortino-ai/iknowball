import { useState, useEffect } from 'react'
import { formatOdds } from '../../lib/scoring'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'

function formatGameTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatPeriod(period, sportKey) {
  // MLB stores period as text (e.g. "Top 5th") — use directly
  if (sportKey?.startsWith('baseball') && period && isNaN(parseInt(period, 10))) {
    return period
  }
  const p = parseInt(period, 10)
  if (!p) return null
  // WNCAAB uses quarters, NCAAB uses halves
  if (sportKey === 'basketball_nba' || sportKey === 'basketball_wnba' || sportKey === 'basketball_wncaab') {
    const labels = ['1st', '2nd', '3rd', '4th']
    return p <= 4 ? `${labels[p - 1]} Qtr` : `OT${p - 4}`
  }
  if (sportKey === 'basketball_ncaab') {
    return p <= 2 ? (p === 1 ? '1st Half' : '2nd Half') : `OT${p - 2}`
  }
  if (sportKey?.startsWith('americanfootball')) {
    const labels = ['1st', '2nd', '3rd', '4th']
    return p <= 4 ? `${labels[p - 1]} Qtr` : `OT${p - 4}`
  }
  if (sportKey?.startsWith('icehockey')) {
    const labels = ['1st', '2nd', '3rd']
    return p <= 3 ? `${labels[p - 1]} Period` : `OT${p - 3}`
  }
  if (sportKey?.startsWith('baseball')) {
    const labels = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
    return p <= 9 ? labels[p - 1] : `${p}th`
  }
  if (sportKey?.startsWith('soccer')) {
    return p === 1 ? '1st Half' : p === 2 ? '2nd Half' : `ET${p - 2}`
  }
  return `P${p}`
}

function LegModal({ game, onClose }) {
  useEffect(() => {
    lockScroll()
    return () => unlockScroll()
  }, [])

  if (!game) return null

  const isLive = game.status === 'live' && game.live_home_score != null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-text-muted hover:text-text-primary text-xl leading-none p-3"
        >
          &times;
        </button>

        {isLive ? (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-correct font-semibold uppercase tracking-wider">Live</span>
              {(game.period || game.clock) && (
                <span className="text-xs text-text-primary font-semibold">
                  {game.period ? formatPeriod(game.period, game.sports?.key) : ''}
                  {game.period && game.clock ? ' ' : ''}
                  {game.clock || ''}
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-sm text-text-secondary mb-1">{game.away_team}</div>
                <div className="text-3xl font-display">{game.live_away_score}</div>
              </div>
              <div className="text-text-muted text-sm">@</div>
              <div className="text-center">
                <div className="text-sm text-text-secondary mb-1">{game.home_team}</div>
                <div className="text-3xl font-display">{game.live_home_score}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-2 py-2">
            <div className="text-sm text-text-secondary">
              {game.away_team} @ {game.home_team}
            </div>
            <div className="text-text-primary">
              This game starts {formatGameTime(game.starts_at)}. Good luck!
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ParlayCard({ parlay, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [selectedGame, setSelectedGame] = useState(null)

  const isWon = parlay.is_correct === true
  const isLost = parlay.is_correct === false
  const isPush = parlay.is_correct === null && parlay.status === 'settled'
  const isPending = parlay.status === 'pending'
  const isLocked = parlay.status === 'locked'

  const borderColor = isWon ? 'border-correct' : isLost ? 'border-red-900' : isPending ? 'border-accent/50' : isLocked ? 'border-accent' : 'border-border'
  const badgeColor = isWon ? 'text-correct' : isLost ? 'text-incorrect' : isPending ? 'text-accent' : isLocked ? 'text-accent' : 'text-text-muted'
  const badgeLabel = isWon ? 'Won' : isLost ? 'Lost' : isPending ? 'Pending' : isLocked ? 'Locked' : 'Push'

  return (
    <div className={`bg-bg-primary rounded-2xl border ${borderColor === 'border-border' ? 'border-text-primary/20' : borderColor} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-text-primary font-semibold text-sm">
            {parlay.leg_count}-Leg Parlay
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badgeLabel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {parlay.points_earned !== null && parlay.points_earned !== 0 && (
            <span className={`text-sm font-semibold ${parlay.points_earned > 0 ? 'text-correct' : 'text-incorrect'}`}>
              {parlay.points_earned > 0 ? '+' : ''}{parlay.points_earned} pts
            </span>
          )}
          {(isPending || isLocked) && (
            <span className="text-sm text-text-muted">
              <span className="text-incorrect">-{parlay.risk_points}</span>
              {' / '}
              <span className="text-correct">+{parlay.reward_points}</span>
            </span>
          )}
          {isPush && (
            <span className="text-sm text-text-muted">0 pts</span>
          )}
          <span className="text-text-muted text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && parlay.parlay_legs && (
        <div className="px-4 pb-4 space-y-2">
          {parlay.parlay_legs.map((leg) => {
            const team = leg.picked_team === 'home' ? leg.games?.home_team : leg.games?.away_team
            const odds = leg.odds_at_lock ?? leg.odds_at_submission
            const legWon = leg.status === 'won'
            const legLost = leg.status === 'lost'
            const legPush = leg.status === 'push'
            const isFinal = leg.games?.status === 'final'

            return (
              <button
                key={leg.id}
                onClick={!isFinal ? () => setSelectedGame(leg.games) : undefined}
                className={`w-full flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm text-left${!isFinal ? ' cursor-pointer hover:bg-bg-card-hover transition-colors' : ''}`}
              >
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
              </button>
            )
          })}
          <div className="text-center text-xs text-text-muted pt-1">
            Combined: {Number(parlay.combined_multiplier).toFixed(2)}x
          </div>
          {isPending && onDelete && (
            <button
              onClick={() => onDelete(parlay.id)}
              className="w-full mt-1 py-2 rounded-lg text-sm font-semibold text-incorrect bg-incorrect/10 hover:bg-incorrect/20 transition-colors"
            >
              Delete Parlay
            </button>
          )}
        </div>
      )}

      {selectedGame && (
        <LegModal game={selectedGame} onClose={() => setSelectedGame(null)} />
      )}
    </div>
  )
}
