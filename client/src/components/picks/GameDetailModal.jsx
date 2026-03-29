import { useEffect } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useGameIntel } from '../../hooks/useGames'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function GameDetailModal({ gameId, onClose }) {
  const { data, isLoading } = useGameIntel(gameId)

  useEffect(() => {
    if (!gameId) return
    lockScroll()
    return () => unlockScroll()
  }, [gameId])

  if (!gameId) return null

  const game = data?.game

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 max-h-[90vh] md:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-10 h-10 flex items-center justify-center text-text-muted hover:text-text-primary text-xl leading-none rounded-full hover:bg-bg-secondary transition-colors"
        >
          &times;
        </button>

        <h2 className="font-display text-lg mb-4">Game Intel</h2>

        {isLoading ? (
          <LoadingSpinner />
        ) : !game ? (
          <p className="text-text-muted text-center">No data available</p>
        ) : (
          <div className="space-y-5">
            {/* Team records */}
            {(data.homeRecord || data.awayRecord) && (
              <div className="flex items-center justify-between px-2">
                <div className="text-center flex-1">
                  <div className="font-display text-base">{game.away_team}</div>
                  <div className="text-sm font-bold text-text-primary">{data.awayRecord || '—'}</div>
                  {data.awayLast10 && <div className="text-[10px] text-text-muted">L10: {data.awayLast10}</div>}
                </div>
                <div className="text-xs text-text-muted font-semibold">@</div>
                <div className="text-center flex-1">
                  <div className="font-display text-base">{game.home_team}</div>
                  <div className="text-sm font-bold text-text-primary">{data.homeRecord || '—'}</div>
                  {data.homeLast10 && <div className="text-[10px] text-text-muted">L10: {data.homeLast10}</div>}
                </div>
              </div>
            )}

            {/* Probable pitchers (MLB) */}
            {(data.awayPitcher || data.homePitcher) && (
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Probable Pitchers</div>
                <div className="space-y-3">
                  {data.awayPitcher && (
                    <div className="flex items-center gap-3">
                      {data.awayPitcher.headshot && (
                        <img src={data.awayPitcher.headshot} alt="" className="w-12 h-12 rounded-full object-cover bg-bg-secondary" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary">{data.awayPitcher.name}</div>
                        <div className="text-xs text-text-muted">{game.away_team.split(' ').pop()}{data.awayPitcher.record ? ` · ${data.awayPitcher.record}` : ''}</div>
                        {data.awayPitcher.stats && (
                          <div className="text-xs text-text-secondary mt-0.5">{data.awayPitcher.stats}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {data.awayPitcher && data.homePitcher && <div className="h-px bg-text-primary/10" />}
                  {data.homePitcher && (
                    <div className="flex items-center gap-3">
                      {data.homePitcher.headshot && (
                        <img src={data.homePitcher.headshot} alt="" className="w-12 h-12 rounded-full object-cover bg-bg-secondary" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary">{data.homePitcher.name}</div>
                        <div className="text-xs text-text-muted">{game.home_team.split(' ').pop()}{data.homePitcher.record ? ` · ${data.homePitcher.record}` : ''}</div>
                        {data.homePitcher.stats && (
                          <div className="text-xs text-text-secondary mt-0.5">{data.homePitcher.stats}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
