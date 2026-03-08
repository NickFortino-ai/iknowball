import { useEffect } from 'react'

export default function LeagueWinModal({ data, onClose }) {
  useEffect(() => {
    if (!data) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [data])

  if (!data) return null

  // Backward compat: existing survivor_win notifications have no format in metadata
  const format = data.format || (data.outlasted != null ? 'survivor' : 'pickem')
  const isSurvivorWin = format === 'survivor' && data.mode === 'win'
  const isSurvivorStreakEnd = format === 'survivor' && data.mode === 'streak_ended'
  const isSurvivorSettled = format === 'survivor' && data.mode === 'settled'
  const isSurvivor = isSurvivorWin || isSurvivorStreakEnd || isSurvivorSettled
  const isBracket = format === 'bracket'

  const glowClass = (isSurvivorWin || isSurvivorSettled) ? 'parlay-win-glow' : isSurvivorStreakEnd ? 'survivor-streak-glow' : 'parlay-win-glow'
  const borderColor = (isSurvivorWin || isSurvivorSettled) ? 'border-correct' : isSurvivorStreakEnd ? 'border-accent' : 'border-correct'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative bg-bg-card border ${borderColor} w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto ${glowClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        <div className="text-center space-y-4 py-4">
          {isSurvivorSettled ? (
            <>
              <div className="text-5xl">{'\uD83D\uDC51'}</div>
              <h2 className="text-2xl font-display font-bold text-correct">League Settled!</h2>
              <p className="text-text-secondary">
                You settled <span className="text-text-primary font-semibold">{data.leagueName}</span>. What a run!
              </p>

              <div className="flex justify-center gap-6 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-correct">+{data.points}</div>
                  <div className="text-xs text-text-muted">Points Earned</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-primary">{data.outlasted}</div>
                  <div className="text-xs text-text-muted">Players Outlasted</div>
                </div>
              </div>

              <p className="text-xs text-text-muted pt-2">
                Your bonus points were added to your global score.
              </p>
            </>
          ) : isSurvivorWin ? (
            <>
              <div className="text-5xl">{'\uD83D\uDC51'}</div>
              <h2 className="text-2xl font-display font-bold text-correct">Congratulations!</h2>
              <p className="text-text-secondary">
                You won the <span className="text-text-primary font-semibold">{data.leagueName}</span> survivor pool!
              </p>

              <div className="flex justify-center gap-6 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-correct">+{data.points}</div>
                  <div className="text-xs text-text-muted">Points Earned</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-primary">{data.outlasted}</div>
                  <div className="text-xs text-text-muted">Players Outlasted</div>
                </div>
              </div>

              <p className="text-xs text-text-muted pt-2">
                Keep picking to extend your streak!
              </p>
            </>
          ) : isSurvivorStreakEnd ? (
            <>
              <div className="text-5xl">{'\uD83C\uDFC6'}</div>
              <h2 className="text-xl font-display font-bold text-text-primary">
                Your epic streak has finally come to an end
              </h2>
              <p className="text-2xl font-display font-bold text-accent">YOU KNOW BALL</p>

              <div className="flex justify-center gap-6 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-accent">+{data.points}</div>
                  <div className="text-xs text-text-muted">Points Earned</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-primary">{data.outlasted}</div>
                  <div className="text-xs text-text-muted">Players Outlasted</div>
                </div>
              </div>

              <p className="text-sm text-text-secondary pt-2">
                {data.leagueName}
              </p>
            </>
          ) : (
            <>
              <div className="text-5xl">{'\uD83C\uDFC6'}</div>
              <h2 className="text-2xl font-display font-bold text-correct">Congratulations!</h2>
              <p className="text-text-secondary">
                You won the <span className="text-text-primary font-semibold">{data.leagueName}</span> {isBracket ? 'bracket' : 'league'}!
              </p>

              <div className="flex justify-center gap-6 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-correct">+{data.points}</div>
                  <div className="text-xs text-text-muted">Points Earned</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-primary">{data.memberCount}</div>
                  <div className="text-xs text-text-muted">{isBracket ? 'Entries' : 'League Size'}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
