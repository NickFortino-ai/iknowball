import PickButton from './PickButton'
import { formatOdds } from '../../lib/scoring'
import PickReactions from '../social/PickReactions'

function formatGameTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function GameCard({ game, userPick, onPick, onUndoPick, isSubmitting, reactions, onShare, isShared, parlayMode, parlayPickedTeam, onParlayToggle }) {
  const isLocked = game.status !== 'upcoming'
  const isFinal = game.status === 'final'

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
    if (userPick.status === 'locked') return 'locked'
    return 'selected'
  }

  function handleClick(side) {
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
    <div className="bg-bg-card rounded-2xl border border-border p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted uppercase tracking-wider">
          {game.sports?.name || 'NFL'}
        </span>
        <span className="text-xs text-text-muted">
          {isFinal
            ? 'Final'
            : game.status === 'live'
              ? 'LIVE'
              : formatGameTime(game.starts_at)
          }
        </span>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <PickButton
            team={game.away_team}
            odds={game.away_odds}
            score={isFinal ? game.away_score : null}
            state={getButtonState('away')}
            disabled={isLocked || isSubmitting}
            onClick={() => handleClick('away')}
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
            score={isFinal ? game.home_score : null}
            state={getButtonState('home')}
            disabled={isLocked || isSubmitting}
            onClick={() => handleClick('home')}
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

      {!parlayMode && onShare && userPick && (userPick.status === 'pending' || userPick.status === 'locked') && (
        <div className="mt-3 text-center">
          <button
            onClick={() => onShare(userPick.id)}
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
