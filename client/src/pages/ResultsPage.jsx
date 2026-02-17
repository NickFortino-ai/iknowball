import { useMemo } from 'react'
import { usePickHistory } from '../hooks/usePicks'
import { useParlayHistory } from '../hooks/useParlays'
import { usePickReactionsBatch } from '../hooks/useSocial'
import GameCard from '../components/picks/GameCard'
import ParlayCard from '../components/picks/ParlayCard'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function ResultsPage() {
  const { data: picks, isLoading } = usePickHistory()
  const { data: parlays, isLoading: parlaysLoading } = useParlayHistory()

  const weeklyStats = useMemo(() => {
    if (!picks?.length && !parlays?.length) return null
    let wins = 0, losses = 0, pushes = 0, netPoints = 0
    for (const pick of (picks || [])) {
      if (pick.is_correct === true) wins++
      else if (pick.is_correct === false) losses++
      else pushes++
      netPoints += pick.points_earned || 0
    }
    for (const parlay of (parlays || [])) {
      if (parlay.is_correct === true) wins++
      else if (parlay.is_correct === false) losses++
      else pushes++
      netPoints += parlay.points_earned || 0
    }
    return { wins, losses, pushes, netPoints, total: (picks?.length || 0) + (parlays?.length || 0) }
  }, [picks, parlays])

  const settledPickIds = useMemo(() => {
    if (!picks?.length) return []
    return picks.filter((p) => p.status === 'settled').map((p) => p.id)
  }, [picks])

  const { data: reactionsBatch } = usePickReactionsBatch(settledPickIds)

  if (isLoading || parlaysLoading) return <LoadingSpinner />

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

      {parlays?.length > 0 && (
        <>
          <h2 className="font-display text-lg text-text-secondary mb-3">Parlays</h2>
          <div className="space-y-3 mb-6">
            {parlays.map((parlay) => (
              <ParlayCard key={parlay.id} parlay={parlay} />
            ))}
          </div>
        </>
      )}

      {!picks?.length && !parlays?.length ? (
        <EmptyState title="No results yet" message="Your settled picks will appear here" />
      ) : picks?.length > 0 && (
        <>
          {parlays?.length > 0 && (
            <h2 className="font-display text-lg text-text-secondary mb-3">Straight Picks</h2>
          )}
          <div className="space-y-3">
            {picks.map((pick) => (
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
    </div>
  )
}
