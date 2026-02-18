import { useMemo } from 'react'
import { usePickHistory } from '../hooks/usePicks'
import { useParlayHistory } from '../hooks/useParlays'
import { usePropPickHistory } from '../hooks/useProps'
import { usePickReactionsBatch } from '../hooks/useSocial'
import GameCard from '../components/picks/GameCard'
import ParlayCard from '../components/picks/ParlayCard'
import PropCard from '../components/picks/PropCard'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function ResultsPage() {
  const { data: picks, isLoading } = usePickHistory()
  const { data: parlays, isLoading: parlaysLoading } = useParlayHistory()
  const { data: propPicks, isLoading: propsLoading } = usePropPickHistory()

  const { livePicks, settledPicks, liveParlays, settledParlays, liveProps, settledProps } = useMemo(() => {
    return {
      livePicks: (picks || []).filter(p => p.status === 'locked'),
      settledPicks: (picks || []).filter(p => p.status === 'settled'),
      liveParlays: (parlays || []).filter(p => p.status === 'locked'),
      settledParlays: (parlays || []).filter(p => p.status === 'settled'),
      liveProps: (propPicks || []).filter(p => p.status === 'locked'),
      settledProps: (propPicks || []).filter(p => p.status === 'settled'),
    }
  }, [picks, parlays, propPicks])

  const hasLive = livePicks.length > 0 || liveParlays.length > 0 || liveProps.length > 0
  const hasSettled = settledPicks.length > 0 || settledParlays.length > 0 || settledProps.length > 0

  const weeklyStats = useMemo(() => {
    if (!settledPicks.length && !settledParlays.length && !settledProps.length) return null
    let wins = 0, losses = 0, pushes = 0, netPoints = 0
    for (const pick of settledPicks) {
      if (pick.is_correct === true) wins++
      else if (pick.is_correct === false) losses++
      else pushes++
      netPoints += pick.points_earned || 0
    }
    for (const parlay of settledParlays) {
      if (parlay.is_correct === true) wins++
      else if (parlay.is_correct === false) losses++
      else pushes++
      netPoints += parlay.points_earned || 0
    }
    for (const pp of settledProps) {
      if (pp.is_correct === true) wins++
      else if (pp.is_correct === false) losses++
      else pushes++
      netPoints += pp.points_earned || 0
    }
    return { wins, losses, pushes, netPoints, total: settledPicks.length + settledParlays.length + settledProps.length }
  }, [settledPicks, settledParlays, settledProps])

  const settledPickIds = useMemo(() => {
    return settledPicks.map((p) => p.id)
  }, [settledPicks])

  const { data: reactionsBatch } = usePickReactionsBatch(settledPickIds)

  if (isLoading || parlaysLoading || propsLoading) return <LoadingSpinner />

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Results</h1>

      {weeklyStats && (
        <div className="bg-bg-card rounded-2xl border border-border p-4 mb-6">
          <h2 className="font-display text-sm text-text-muted uppercase tracking-wider mb-3">Summary</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 text-center">
            <div>
              <div className="font-display text-2xl text-correct">{weeklyStats.wins}</div>
              <div className="text-xs text-text-muted">Wins</div>
            </div>
            <div>
              <div className="font-display text-2xl text-incorrect">{weeklyStats.losses}</div>
              <div className="text-xs text-text-muted">Losses</div>
            </div>
            <div>
              <div className="font-display text-2xl text-text-secondary">{weeklyStats.pushes}</div>
              <div className="text-xs text-text-muted">Pushes</div>
            </div>
            <div>
              <div className={`font-display text-2xl ${weeklyStats.netPoints >= 0 ? 'text-correct' : 'text-incorrect'}`}>
                {weeklyStats.netPoints > 0 ? '+' : ''}{weeklyStats.netPoints}
              </div>
              <div className="text-xs text-text-muted">Net Pts</div>
            </div>
          </div>
        </div>
      )}

      {hasLive && (
        <>
          <h2 className="font-display text-lg text-accent mb-3">Live</h2>
          <div className="space-y-3 mb-6">
            {liveParlays.map((parlay) => (
              <ParlayCard key={parlay.id} parlay={parlay} />
            ))}
            {liveProps.map((pp) => (
              <PropCard key={pp.id} prop={pp.player_props} pick={pp} />
            ))}
            {livePicks.map((pick) => (
              <GameCard
                key={pick.id}
                game={pick.games}
                userPick={pick}
              />
            ))}
          </div>
        </>
      )}

      {!hasLive && !hasSettled ? (
        <EmptyState title="No results yet" message="Your settled picks will appear here" />
      ) : hasSettled && (
        <>
          {settledParlays.length > 0 && (
            <>
              <h2 className="font-display text-lg text-text-secondary mb-3">Parlays</h2>
              <div className="space-y-3 mb-6">
                {settledParlays.map((parlay) => (
                  <ParlayCard key={parlay.id} parlay={parlay} />
                ))}
              </div>
            </>
          )}

          {settledProps.length > 0 && (
            <>
              <h2 className="font-display text-lg text-text-secondary mb-3">Player Props</h2>
              <div className="space-y-3 mb-6">
                {settledProps.map((pp) => (
                  <PropCard key={pp.id} prop={pp.player_props} pick={pp} />
                ))}
              </div>
            </>
          )}

          {settledPicks.length > 0 && (
            <>
              {(settledParlays.length > 0 || settledProps.length > 0) && (
                <h2 className="font-display text-lg text-text-secondary mb-3">Straight Picks</h2>
              )}
              <div className="space-y-3">
                {settledPicks.map((pick) => (
                  <GameCard
                    key={pick.id}
                    game={pick.games}
                    userPick={pick}
                    reactions={reactionsBatch?.[pick.id]}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
