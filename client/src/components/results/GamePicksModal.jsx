import { useEffect } from 'react'
import { useGamePicks } from '../../hooks/usePicks'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function GamePicksModal({ game, onClose }) {
  const { data, isLoading } = useGamePicks(game?.id)

  useEffect(() => {
    if (!game) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [game])

  if (!game) return null

  const totalPicks = (data?.totalCounts?.home || 0) + (data?.totalCounts?.away || 0)
  const homePct = totalPicks > 0 ? Math.round((data.totalCounts.home / totalPicks) * 100) : 0
  const awayPct = totalPicks > 0 ? 100 - homePct : 0

  const squadHome = (data?.squadPicks || []).filter((p) => p.picked_team === 'home')
  const squadAway = (data?.squadPicks || []).filter((p) => p.picked_team === 'away')

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 pb-20 md:pb-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="font-display text-lg">{game.away_team} @ {game.home_team}</h2>
          <p className="text-xs text-text-muted">{game.sports?.name || 'Game'}</p>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* All Picks bar */}
            <div className="bg-bg-primary rounded-xl p-4 mb-5">
              <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">All Picks</h3>
              {totalPicks === 0 ? (
                <p className="text-sm text-text-muted text-center">No picks yet</p>
              ) : (
                <>
                  <div className="flex justify-between text-sm font-semibold mb-1">
                    <span>{game.away_team} ({awayPct}%)</span>
                    <span>{game.home_team} ({homePct}%)</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-border">
                    {awayPct > 0 && (
                      <div
                        className="bg-accent transition-all"
                        style={{ width: `${awayPct}%` }}
                      />
                    )}
                    {homePct > 0 && (
                      <div
                        className="bg-text-secondary transition-all"
                        style={{ width: `${homePct}%` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-text-muted mt-1">
                    <span>{data.totalCounts.away}</span>
                    <span>{data.totalCounts.home}</span>
                  </div>
                </>
              )}
            </div>

            {/* Your Squad */}
            <div>
              <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Your Squad</h3>
              {data?.squadPicks?.length > 0 ? (
                <div className="space-y-2">
                  {[...squadAway, ...squadHome].map((pick) => (
                    <div key={pick.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-8 h-8 rounded-full bg-bg-primary flex items-center justify-center text-sm shrink-0">
                          {pick.avatar_emoji || (pick.display_name || pick.username)?.[0]?.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {pick.display_name || pick.username}
                        </span>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        pick.picked_team === 'home'
                          ? 'bg-text-secondary/15 text-text-secondary'
                          : 'bg-accent/15 text-accent'
                      }`}>
                        {pick.picked_team === 'home' ? game.home_team : game.away_team}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-2">None of your squad picked this game</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
