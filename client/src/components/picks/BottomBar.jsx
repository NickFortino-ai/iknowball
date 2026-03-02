import { useState, useEffect } from 'react'
import { calculateRiskPoints, calculateRewardPoints } from '../../lib/scoring'

function teamName(fullName) {
  if (!fullName) return ''
  const parts = fullName.split(' ')
  return parts[parts.length - 1]
}

export default function BottomBar({ picks, games, profile, onUpdateMultiplier }) {
  const [expanded, setExpanded] = useState(false)
  const [multiplyOn, setMultiplyOn] = useState(false)

  // Lock body scroll when expanded on mobile
  useEffect(() => {
    if (expanded) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [expanded])

  if (!picks || Object.keys(picks).length === 0) return null

  const entries = Object.entries(picks)
  const pickCount = entries.length
  const totalPoints = profile?.total_points ?? 0
  const canMultiply = totalPoints >= 20

  // Calculate used budget from other multiplied picks
  const usedBudget = entries.reduce((sum, [, pick]) => {
    if (!pick.multiplier || pick.multiplier <= 1) return sum
    const game = games?.find((g) => g.id === pick.game_id)
    if (!game) return sum
    const odds = pick.picked_team === 'home' ? game.home_odds : game.away_odds
    if (!odds) return sum
    const baseRisk = calculateRiskPoints(odds)
    return sum + baseRisk * (pick.multiplier - 1)
  }, 0)

  const remainingBudget = totalPoints - usedBudget

  // Compute totals
  let totalRisk = 0
  let totalReward = 0
  let favCount = 0
  let dogCount = 0

  for (const [, pick] of entries) {
    const game = games?.find((g) => g.id === pick.game_id)
    if (!game) continue
    const odds = pick.picked_team === 'home' ? game.home_odds : game.away_odds
    if (!odds) continue
    const mult = pick.multiplier || 1
    totalRisk += calculateRiskPoints(odds) * mult
    totalReward += calculateRewardPoints(odds) * mult
    if (odds < 0) favCount++
    else dogCount++
  }

  const summaryBar = (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-4">
        <span className="text-text-primary font-semibold">{pickCount} pick{pickCount !== 1 ? 's' : ''}</span>
        <span className="text-text-muted">
          <span className="hidden md:inline">{favCount} {favCount === 1 ? 'Favorite' : 'Favorites'} / {dogCount} {dogCount === 1 ? 'Dog' : 'Dogs'}</span>
          <span className="md:hidden">{favCount} {favCount === 1 ? 'Fave' : 'Faves'} / {dogCount} {dogCount === 1 ? 'Dog' : 'Dogs'}</span>
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-incorrect">Risk: {totalRisk}</span>
        <span className="text-correct">Reward: {totalReward}</span>
      </div>
    </div>
  )

  if (!expanded) {
    return (
      <div
        data-onboarding="bottom-bar"
        className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 bg-bg-secondary border-t border-border px-4 py-3 z-40 cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <div className="flex-1">{summaryBar}</div>
          <svg className="w-5 h-5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 bg-bg-secondary border-t border-border z-40">
      <div className="max-w-2xl mx-auto px-4 py-3">
        {/* Top row: Multiply toggle + close */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setMultiplyOn(!multiplyOn)}
            className={`flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              multiplyOn && canMultiply
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary border border-border'
            } ${!canMultiply ? 'opacity-50' : ''}`}
          >
            Multiply
          </button>
          <button onClick={() => setExpanded(false)} className="p-1 text-text-muted hover:text-text-primary">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Minimum points message */}
        {multiplyOn && !canMultiply && (
          <div className="text-xs text-text-muted mb-3 bg-bg-card rounded-lg px-3 py-2 border border-border">
            You need a minimum of 20 points to multiply your risk/reward. You're not quite there yet. Keep grinding!
          </div>
        )}

        {/* Pick list */}
        <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide mb-3">
          {entries.map(([gameId, pick]) => {
            const game = games?.find((g) => g.id === gameId)
            if (!game) return null
            const odds = pick.picked_team === 'home' ? game.home_odds : game.away_odds
            if (!odds) return null
            const baseRisk = calculateRiskPoints(odds)
            const baseReward = calculateRewardPoints(odds)
            const mult = pick.multiplier || 1

            // Determine which multiplier squares are affordable
            const affordableMultipliers = [2, 3, 4].filter((m) => {
              const extraCost = baseRisk * (m - 1)
              // Subtract current pick's extra cost from used budget (since we'd be replacing it)
              const currentExtra = mult > 1 ? baseRisk * (mult - 1) : 0
              return (extraCost - currentExtra) <= remainingBudget
            })

            return (
              <div key={gameId} className="flex items-center gap-3 py-1.5">
                {/* Team matchup */}
                <div className="flex-1 min-w-0 text-sm truncate">
                  <span className={pick.picked_team === 'away' ? 'text-accent font-semibold' : 'text-text-primary'}>
                    {teamName(game.away_team)}
                  </span>
                  <span className="text-text-muted"> vs </span>
                  <span className={pick.picked_team === 'home' ? 'text-accent font-semibold' : 'text-text-primary'}>
                    {teamName(game.home_team)}
                  </span>
                </div>

                {/* Multiplier squares */}
                {multiplyOn && canMultiply && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    {[2, 3, 4].map((m) => {
                      if (!affordableMultipliers.includes(m) && mult !== m) return null
                      const isActive = mult === m
                      return (
                        <button
                          key={m}
                          onClick={() => onUpdateMultiplier(gameId, isActive ? 1 : m)}
                          className={`w-8 h-8 rounded text-xs font-bold border transition-colors ${
                            isActive
                              ? 'bg-accent border-accent text-white'
                              : 'border-border text-text-secondary hover:border-accent hover:text-accent'
                          }`}
                        >
                          {m}x
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Risk → Reward */}
                <div className="flex items-center gap-2 text-sm flex-shrink-0">
                  <span className="text-incorrect">{baseRisk * mult}</span>
                  <span className="text-text-muted">→</span>
                  <span className="text-correct">{baseReward * mult}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom summary */}
        {summaryBar}
      </div>
    </div>
  )
}
