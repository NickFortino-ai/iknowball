import { useEffect } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useHeadToHeadHistory } from '../../hooks/useConnections'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'

function formatGameDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}


export default function HeadToHeadDetailModal({ item, onClose }) {
  const userAId = item?.matchup?.userA?.userId
  const userBId = item?.matchup?.userB?.userId
  const { data, isLoading } = useHeadToHeadHistory(userAId, userBId)

  useEffect(() => {
    if (!item) return
    lockScroll()
    return () => unlockScroll()
  }, [item])

  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary border border-accent/30 w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        {isLoading ? (
          <LoadingSpinner />
        ) : !data ? (
          <p className="text-text-muted text-center">Could not load rivalry history</p>
        ) : (
          <div className="space-y-5">
            {/* User vs User header */}
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1">
                <Avatar user={data.userA} size="2xl" />
                <span className="text-sm font-semibold text-accent truncate max-w-full text-center">
                  {data.userA.display_name || data.userA.username}
                </span>
              </div>
              <span className="text-lg font-bold text-text-muted shrink-0">VS</span>
              <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1">
                <Avatar user={data.userB} size="2xl" />
                <span className="text-sm font-semibold text-accent truncate max-w-full text-center">
                  {data.userB.display_name || data.userB.username}
                </span>
              </div>
            </div>

            {/* Win totals */}
            <div className="flex items-center justify-center gap-6">
              <span className="text-3xl font-bold text-accent">{data.userAWins}</span>
              <div className="flex flex-col items-center">
                <span className="text-xs text-text-muted uppercase tracking-wider">Record</span>
                {data.ties > 0 && (
                  <span className="text-xs text-text-muted">{data.ties} tie{data.ties !== 1 ? 's' : ''}</span>
                )}
              </div>
              <span className="text-3xl font-bold text-accent">{data.userBWins}</span>
            </div>

            {/* Rivalry narrative */}
            {data.narrative && (
              <p className="text-sm text-text-muted italic text-center">{data.narrative}</p>
            )}

            {/* Game history list */}
            {data.games.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs text-text-muted uppercase tracking-wider font-semibold">Game History</h4>
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                  {data.games.map((game) => {
                    const aWon = game.userA_correct && !game.userB_correct
                    const bWon = game.userB_correct && !game.userA_correct
                    const isTie = !aWon && !bWon

                    // Color the team names: winner's pick = green, loser's pick = white
                    const awayIsA = game.userA_team === game.away_team
                    const awayColor = awayIsA
                      ? (aWon ? 'text-correct' : isTie ? 'text-text-primary' : 'text-text-primary')
                      : (bWon ? 'text-correct' : isTie ? 'text-text-primary' : 'text-text-primary')
                    const homeColor = awayIsA
                      ? (bWon ? 'text-correct' : isTie ? 'text-text-primary' : 'text-text-primary')
                      : (aWon ? 'text-correct' : isTie ? 'text-text-primary' : 'text-text-primary')

                    return (
                      <div key={game.game_id} className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">
                            <span className={awayColor}>{game.away_team}</span>
                            <span className="text-text-muted"> @ </span>
                            <span className={homeColor}>{game.home_team}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {game.sport_name && (
                              <span className="text-[10px] text-text-muted">{game.sport_name}</span>
                            )}
                            <span className="text-[10px] text-text-muted">{formatGameDate(game.date)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          {/* User A result */}
                          <span className={`text-xs font-bold ${aWon ? 'text-correct' : isTie ? 'text-text-muted' : 'text-incorrect'}`}>
                            {aWon ? '\u2713' : isTie ? '-' : '\u2717'}
                          </span>
                          <span className="text-[10px] text-text-muted">|</span>
                          {/* User B result */}
                          <span className={`text-xs font-bold ${bWon ? 'text-correct' : isTie ? 'text-text-muted' : 'text-incorrect'}`}>
                            {bWon ? '\u2713' : isTie ? '-' : '\u2717'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
