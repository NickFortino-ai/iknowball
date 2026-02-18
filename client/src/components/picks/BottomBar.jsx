import { calculateRiskPoints, calculateRewardPoints } from '../../lib/scoring'

export default function BottomBar({ picks, games }) {
  if (!picks || Object.keys(picks).length === 0) return null

  const entries = Object.entries(picks)
  const pickCount = entries.length
  let totalRisk = 0
  let totalReward = 0
  let favCount = 0
  let dogCount = 0

  for (const [gameId, team] of entries) {
    const game = games?.find((g) => g.id === gameId)
    if (!game) continue

    const odds = team === 'home' ? game.home_odds : game.away_odds
    if (!odds) continue

    totalRisk += calculateRiskPoints(odds)
    totalReward += calculateRewardPoints(odds)

    if (odds < 0) favCount++
    else dogCount++
  }

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-bg-secondary border-t border-border px-4 py-3 z-40">
      <div className="max-w-2xl mx-auto flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-text-primary font-semibold">{pickCount} pick{pickCount !== 1 ? 's' : ''}</span>
          <span className="text-text-muted">
            <span className="hidden md:inline">{favCount} {favCount === 1 ? 'Favorite' : 'Favorites'} / {dogCount} {dogCount === 1 ? 'Dog' : 'Dogs'}</span>
            <span className="md:hidden">{favCount}F / {dogCount}D</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-incorrect">Risk: {totalRisk}</span>
          <span className="text-correct">Reward: {totalReward}</span>
        </div>
      </div>
    </div>
  )
}
