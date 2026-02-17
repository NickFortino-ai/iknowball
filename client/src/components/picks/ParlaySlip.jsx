import { useState } from 'react'
import { usePickStore } from '../../stores/pickStore'
import { useCreateParlay } from '../../hooks/useParlays'
import { americanToMultiplier, formatOdds, BASE_RISK_POINTS } from '../../lib/scoring'
import { toast } from '../ui/Toast'

export default function ParlaySlip() {
  const [expanded, setExpanded] = useState(false)
  const parlayLegs = usePickStore((s) => s.parlayLegs)
  const clearParlayLegs = usePickStore((s) => s.clearParlayLegs)
  const removeParlayLeg = usePickStore((s) => s.removeParlayLeg)
  const createParlay = useCreateParlay()

  if (parlayLegs.length === 0) return null

  // Calculate combined multiplier and reward
  let combinedMultiplier = 1
  for (const leg of parlayLegs) {
    const odds = leg.pickedTeam === 'home' ? leg.game.home_odds : leg.game.away_odds
    const decimalOdds = odds ? 1 + americanToMultiplier(odds) : 2
    combinedMultiplier *= decimalOdds
  }
  const reward = Math.max(1, Math.round(BASE_RISK_POINTS * (combinedMultiplier - 1)))

  async function handleSubmit() {
    try {
      const legs = parlayLegs.map((l) => ({
        game_id: l.gameId,
        picked_team: l.pickedTeam,
      }))
      await createParlay.mutateAsync(legs)
      clearParlayLegs()
      toast('Parlay locked in!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to create parlay', 'error')
    }
  }

  return (
    <div className="fixed left-0 right-0 bg-bg-secondary border-t border-border z-40 bottom-nav-offset">
      <div className="max-w-2xl mx-auto">
        {/* Collapsed view — always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-3 flex items-center justify-between text-sm"
        >
          <div className="flex items-center gap-3">
            <span className="text-text-primary font-semibold">
              {parlayLegs.length}-Leg Parlay
            </span>
            <span className="bg-accent/20 text-accent text-xs font-bold px-2 py-0.5 rounded-full">
              {combinedMultiplier.toFixed(2)}x
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-incorrect">-{BASE_RISK_POINTS}</span>
            <span className="text-correct">+{reward}</span>
            <span className="text-text-muted text-xs">{expanded ? '▼' : '▲'}</span>
          </div>
        </button>

        {/* Expanded view — leg details */}
        {expanded && (
          <div className="px-4 pb-2 space-y-2">
            {parlayLegs.map((leg) => {
              const odds = leg.pickedTeam === 'home' ? leg.game.home_odds : leg.game.away_odds
              const team = leg.pickedTeam === 'home' ? leg.game.home_team : leg.game.away_team
              return (
                <div key={leg.gameId} className="flex items-center justify-between bg-bg-card rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-text-muted text-xs uppercase">
                      {leg.game.sports?.name || ''}
                    </span>
                    <span className="text-text-primary font-medium truncate">{team}</span>
                    {odds != null && (
                      <span className="text-text-muted text-xs">{formatOdds(odds)}</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeParlayLeg(leg.gameId) }}
                    className="text-text-muted hover:text-incorrect text-lg leading-none ml-2"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Submit button */}
        <div className="px-4 pb-3">
          <button
            onClick={handleSubmit}
            disabled={parlayLegs.length < 2 || createParlay.isPending}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-accent text-white hover:bg-accent/90"
          >
            {createParlay.isPending ? 'Submitting...' : 'Lock Parlay'}
          </button>
        </div>
      </div>
    </div>
  )
}
