import { useEffect } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'

export default function LeagueWinModal({ data, onClose }) {
  useEffect(() => {
    if (!data) return
    lockScroll()
    return () => unlockScroll()
  }, [data])

  if (!data) return null

  // A celebration is the FALLBACK branch of this component, which means any
  // shape it does not recognise gets congratulated. That is how an
  // elimination notification — routed here in error — rendered
  // "Congratulations! You won the league!" over a page that correctly said
  // the user had been eliminated in week 7, with "+undefined" points.
  //
  // The routing bug is fixed in Navbar, but the default is the real hazard:
  // a modal whose unknown-input behaviour is to claim you won. Anything
  // carrying no points is not a win we can describe, so show nothing rather
  // than invent one.
  if (data.points == null) return null

  // Backward compat: existing survivor_win notifications have no format in
  // metadata. `mode` is consulted BEFORE falling back to the outlasted
  // sniff, because outlasted only ever appears on a WIN — so a survivor
  // notification without it was classified as pickem, skipped every
  // survivor branch, and landed in the generic congratulations below.
  const format = data.format
    || ((data.mode === 'streak_ended' || data.mode === 'settled' || data.outlasted != null)
      ? 'survivor'
      : 'pickem')
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
        className={`relative bg-bg-card border ${borderColor} w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[85vh] overflow-y-auto ${glowClass}`}
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
