import { useState } from 'react'
import { useBracketTemplate, useEnterTemplateResult, useUndoTemplateResult } from '../../hooks/useAdmin'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'

export default function BracketTemplateResults({ templateId, onClose }) {
  const { data: template, isLoading } = useBracketTemplate(templateId)
  const enterResult = useEnterTemplateResult()
  const undoResult = useUndoTemplateResult()
  const [selectedMatchup, setSelectedMatchup] = useState(null)

  if (isLoading) return <LoadingSpinner />

  const matchups = template?.matchups || []
  const rounds = template?.rounds || []

  function getRoundName(roundNum) {
    const r = rounds.find((r) => r.round_number === roundNum)
    return r?.name || `Round ${roundNum}`
  }

  // Group matchups by round
  const byRound = {}
  for (const m of matchups) {
    if (!byRound[m.round_number]) byRound[m.round_number] = []
    byRound[m.round_number].push(m)
  }

  async function handleEnterResult(matchupId, winner) {
    try {
      await enterResult.mutateAsync({ templateId, templateMatchupId: matchupId, winner })
      toast('Result entered and synced to all tournaments', 'success')
      setSelectedMatchup(null)
    } catch (err) {
      toast(err.message || 'Failed to enter result', 'error')
    }
  }

  async function handleUndoResult(matchupId) {
    if (!confirm('Undo this result? This will cascade to all tournaments using this template.')) return
    try {
      await undoResult.mutateAsync({ templateId, templateMatchupId: matchupId })
      toast('Result undone', 'success')
    } catch (err) {
      toast(err.message || 'Failed to undo result', 'error')
    }
  }

  const completedCount = matchups.filter((m) => m.winner).length
  const totalNonBye = matchups.filter((m) => !m.is_bye).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-xl">{template.name} - Results</h2>
          <div className="text-xs text-text-muted mt-1">
            {completedCount} / {totalNonBye} matchups completed
          </div>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors"
        >
          Back
        </button>
      </div>

      <div className="space-y-6">
        {Object.entries(byRound)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([roundNum, roundMatchups]) => (
            <div key={roundNum}>
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                {getRoundName(Number(roundNum))}
              </div>
              <div className="space-y-2">
                {roundMatchups.filter((m) => !m.is_bye).map((m) => {
                  const isCompleted = !!m.winner
                  const bothTeamsSet = m.team_top && m.team_bottom
                  const isReady = bothTeamsSet && !isCompleted

                  return (
                    <div key={m.id} className="bg-bg-card rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          {m.seed_top != null && (
                            <span className="text-text-muted text-xs">({m.seed_top}) </span>
                          )}
                          <span className={`font-semibold ${isCompleted && m.winner === 'top' ? 'text-correct' : ''}`}>
                            {m.team_top || 'TBD'}
                          </span>
                          <span className="text-text-muted mx-2">vs</span>
                          {m.seed_bottom != null && (
                            <span className="text-text-muted text-xs">({m.seed_bottom}) </span>
                          )}
                          <span className={`font-semibold ${isCompleted && m.winner === 'bottom' ? 'text-correct' : ''}`}>
                            {m.team_bottom || 'TBD'}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {isCompleted ? (
                            <button
                              onClick={() => handleUndoResult(m.id)}
                              disabled={undoResult.isPending}
                              className="px-3 py-1 rounded-lg text-xs font-semibold text-incorrect hover:bg-incorrect/10 transition-colors disabled:opacity-50"
                            >
                              Undo
                            </button>
                          ) : isReady ? (
                            selectedMatchup === m.id ? (
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
                            )
                          ) : (
                            <span className="text-xs text-text-muted">Waiting for teams</span>
                          )}
                        </div>
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
                  )
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
