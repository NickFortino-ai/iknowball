import PickButton from './PickButton'

function formatGameTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function GameCard({ game, userPick, onPick, onUndoPick, isSubmitting }) {
  const isLocked = game.status !== 'upcoming'
  const isFinal = game.status === 'final'

  function getButtonState(side) {
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
    if (!onPick) return
    // If clicking the same team that's already picked (and still pending), undo it
    if (userPick?.picked_team === side && userPick?.status === 'pending') {
      onUndoPick?.(game.id)
    } else {
      onPick(game.id, side)
    }
  }

  return (
    <div className="bg-bg-card rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted uppercase tracking-wider">
          {game.sports?.name || 'NFL'}
        </span>
        <span className="text-xs text-text-muted">
          {isFinal
            ? `Final: ${game.away_score} - ${game.home_score}`
            : game.status === 'live'
              ? 'LIVE'
              : formatGameTime(game.starts_at)
          }
        </span>
      </div>

      <div className="flex gap-3">
        <PickButton
          team={game.away_team}
          odds={game.away_odds}
          state={getButtonState('away')}
          disabled={isLocked || isSubmitting}
          onClick={() => handleClick('away')}
        />
        <div className="flex items-center text-text-muted text-xs font-semibold">@</div>
        <PickButton
          team={game.home_team}
          odds={game.home_odds}
          state={getButtonState('home')}
          disabled={isLocked || isSubmitting}
          onClick={() => handleClick('home')}
        />
      </div>

      {userPick?.status === 'settled' && userPick.points_earned !== null && (
        <div className={`mt-3 text-center text-sm font-semibold ${userPick.points_earned > 0 ? 'text-correct' : userPick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'}`}>
          {userPick.points_earned > 0 ? '+' : ''}{userPick.points_earned} pts
        </div>
      )}
    </div>
  )
}
