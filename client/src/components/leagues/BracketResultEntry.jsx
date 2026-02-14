import { useState } from 'react'
import { useEnterBracketResult } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'

export default function BracketResultEntry({ league, matchups, tournament }) {
  const enterResult = useEnterBracketResult()
  const [selectedMatchup, setSelectedMatchup] = useState(null)

  // Group pending matchups by round
  const pendingMatchups = (matchups || []).filter(
    (m) => m.status !== 'completed' && m.team_top && m.team_bottom
  )

  const byRound = {}
  for (const m of pendingMatchups) {
    if (!byRound[m.round_number]) byRound[m.round_number] = []
    byRound[m.round_number].push(m)
  }

  const rounds = tournament?.bracket_templates?.rounds || []
  function getRoundName(roundNum) {
    const r = rounds.find((r) => r.round_number === roundNum)
    return r?.name || `Round ${roundNum}`
  }

  async function handleEnterResult(matchupId, winner) {
    try {
      await enterResult.mutateAsync({ leagueId: league.id, matchupId, winner })
      toast('Result entered!', 'success')
      setSelectedMatchup(null)
    } catch (err) {
      toast(err.message || 'Failed to enter result', 'error')
    }
  }

  if (!pendingMatchups.length) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-4 text-center text-sm text-text-muted">
        No matchups ready for results. Either all matchups are completed or teams haven't advanced yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-sm text-text-secondary">Enter Results</h3>
      {Object.entries(byRound)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([roundNum, matchups]) => (
          <div key={roundNum}>
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
              {getRoundName(Number(roundNum))}
            </div>
            <div className="space-y-2">
              {matchups.map((m) => (
                <div key={m.id} className="bg-bg-card rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-text-muted text-xs">({m.seed_top}) </span>
                      <span className="font-semibold">{m.team_top}</span>
                      <span className="text-text-muted mx-2">vs</span>
                      <span className="text-text-muted text-xs">({m.seed_bottom}) </span>
                      <span className="font-semibold">{m.team_bottom}</span>
                    </div>
                    {selectedMatchup === m.id ? (
                      <button
                        onClick={() => setSelectedMatchup(null)}
                        className="text-xs text-text-muted hover:text-text-secondary"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedMatchup(m.id)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover"
                      >
                        Enter Result
                      </button>
                    )}
                  </div>
                  {selectedMatchup === m.id && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleEnterResult(m.id, 'top')}
                        disabled={enterResult.isPending}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold bg-correct/20 text-correct hover:bg-correct/30 disabled:opacity-50"
                      >
                        {m.team_top} Wins
                      </button>
                      <button
                        onClick={() => handleEnterResult(m.id, 'bottom')}
                        disabled={enterResult.isPending}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold bg-correct/20 text-correct hover:bg-correct/30 disabled:opacity-50"
                      >
                        {m.team_bottom} Wins
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
