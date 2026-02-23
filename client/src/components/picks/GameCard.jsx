import PickButton from './PickButton'
import { formatOdds, calculateRiskPoints, calculateRewardPoints } from '../../lib/scoring'
import PickReactions from '../social/PickReactions'

function formatGameTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatLiveStatus(game) {
  const parts = ['LIVE']
  if (game.period || game.clock) {
    const sportKey = game.sports?.key || ''
    let periodLabel = ''
    if (game.period) {
      if (sportKey.includes('basketball') || sportKey.includes('football')) {
        periodLabel = `Q${game.period}`
      } else if (sportKey.includes('baseball')) {
        periodLabel = game.period
      } else if (sportKey.includes('hockey')) {
        periodLabel = `P${game.period}`
      } else if (sportKey.includes('soccer')) {
        periodLabel = game.period === '1' ? '1H' : '2H'
      } else {
        periodLabel = `P${game.period}`
      }
    }
    const detail = [periodLabel, game.clock].filter(Boolean).join(' ')
    if (detail) parts.push(detail)
  }
  return parts.join(' · ')
}

export default function GameCard({ game, userPick, onPick, onUndoPick, isSubmitting, reactions, onShare, isShared, parlayMode, parlayPickedTeam, onParlayToggle, onCardClick }) {
  const isLocked = game.status !== 'upcoming'
  const isFinal = game.status === 'final'
  const isLive = game.status === 'live'
  const hasLiveScores = isLive && game.live_home_score != null

  function getButtonState(side) {
    if (parlayMode) {
      if (parlayPickedTeam === side) return 'selected'
      return isLocked ? 'locked' : 'default'
    }
    if (!userPick) return isLocked ? 'locked' : 'default'
    if (userPick.picked_team !== side) {
      if (isFinal) return 'default'
      if (userPick.status === 'locked') return 'locked'
      return 'default'
    }
    // This side is picked
    if (isFinal) {
      return userPick.is_correct ? 'correct' : 'incorrect'
    }
    if (userPick.status === 'locked') return 'locked-picked'
    return 'selected'
  }

  function handleClick(side, e) {
    e.stopPropagation()
    if (parlayMode) {
      onParlayToggle?.(game.id, side, game)
      return
    }
    if (!onPick) return
    // If clicking the same team that's already picked (and still pending), undo it
    if (userPick?.picked_team === side && userPick?.status === 'pending') {
      onUndoPick?.(game.id)
    } else {
      onPick(game.id, side)
    }
  }

  return (
    <div onClick={onCardClick} className={`bg-bg-card rounded-2xl border ${userPick?.status === 'locked' ? 'border-accent' : 'border-border'} p-4 overflow-hidden${onCardClick ? ' cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted uppercase tracking-wider">
          {game.sports?.name || 'NFL'}
        </span>
        <span className="text-xs text-text-muted">
          {isFinal
            ? 'Final'
            : isLive
              ? formatLiveStatus(game)
              : formatGameTime(game.starts_at)
          }
        </span>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <PickButton
            team={game.away_team}
            odds={game.away_odds}
            score={isFinal ? game.away_score : hasLiveScores ? game.live_away_score : null}
            isLive={hasLiveScores && !isFinal}
            state={getButtonState('away')}
            disabled={isLocked || isSubmitting}
            onClick={(e) => handleClick('away', e)}
          />
          {isFinal && (
            <div className="text-center text-xs text-text-muted mt-1">
              {game.away_odds != null
                ? formatOdds(game.away_odds)
                : userPick?.picked_team === 'away' && userPick?.odds_at_pick != null
                  ? formatOdds(userPick.odds_at_pick)
                  : ''}
            </div>
          )}
        </div>
        <div className="flex items-center text-text-muted text-xs font-semibold">@</div>
        <div className="flex-1 min-w-0">
          <PickButton
            team={game.home_team}
            odds={game.home_odds}
            score={isFinal ? game.home_score : hasLiveScores ? game.live_home_score : null}
            isLive={hasLiveScores && !isFinal}
            state={getButtonState('home')}
            disabled={isLocked || isSubmitting}
            onClick={(e) => handleClick('home', e)}
          />
          {isFinal && (
            <div className="text-center text-xs text-text-muted mt-1">
              {game.home_odds != null
                ? formatOdds(game.home_odds)
                : userPick?.picked_team === 'home' && userPick?.odds_at_pick != null
                  ? formatOdds(userPick.odds_at_pick)
                  : ''}
            </div>
          )}
        </div>
      </div>

      {userPick?.status === 'settled' && userPick.points_earned !== null && (
        <div className={`mt-3 text-center text-sm font-semibold ${userPick.points_earned > 0 ? 'text-correct' : userPick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'}`}>
          {userPick.points_earned > 0 ? '+' : ''}{userPick.points_earned} pts
        </div>
      )}

      {userPick?.status === 'locked' && userPick.odds_at_pick != null && (
        <div className="mt-3 text-center text-sm text-text-muted">
          <span className="text-incorrect">-{calculateRiskPoints(userPick.odds_at_pick)}</span>
          {' / '}
          <span className="text-correct">+{calculateRewardPoints(userPick.odds_at_pick)}</span>
        </div>
      )}

      {!parlayMode && onShare && userPick && (userPick.status === 'pending' || userPick.status === 'locked') && (
        <div className="mt-3 text-center">
          <button
            onClick={(e) => { e.stopPropagation(); onShare(userPick.id) }}
            disabled={isShared}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              isShared
                ? 'bg-bg-secondary text-text-muted cursor-default'
                : 'bg-accent/10 text-accent hover:bg-accent/20'
            }`}
          >
            {isShared ? 'Shared to Squad' : 'Share to Squad'}
          </button>
        </div>
      )}

      {reactions?.length > 0 && (
        <div className="mt-2">
          <PickReactions pickId={userPick?.id} compact reactions={reactions} />
        </div>
      )}
    </div>
  )
}
