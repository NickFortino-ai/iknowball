import { useState } from 'react'
import { useBracketTemplate, useEnterTemplateResult, useUndoTemplateResult, useSetChampionshipScore } from '../../hooks/useAdmin'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'

export default function BracketTemplateResults({ templateId, onClose }) {
  const { data: template, isLoading } = useBracketTemplate(templateId)
  const enterResult = useEnterTemplateResult()
  const undoResult = useUndoTemplateResult()
  const setChampionshipScore = useSetChampionshipScore()
  const [selectedMatchup, setSelectedMatchup] = useState(null)
  const [scores, setScores] = useState({})
  const [champScore, setChampScore] = useState('')

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
    const matchupScores = scores[matchupId]
    const scoreTop = matchupScores?.top !== '' && matchupScores?.top != null ? matchupScores.top : undefined
    const scoreBottom = matchupScores?.bottom !== '' && matchupScores?.bottom != null ? matchupScores.bottom : undefined
    try {
      await enterResult.mutateAsync({ templateId, templateMatchupId: matchupId, winner, scoreTop, scoreBottom })
      toast('Result entered and synced to all tournaments', 'success')
      setSelectedMatchup(null)
      setScores((s) => { const next = { ...s }; delete next[matchupId]; return next })
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
  const allMatchupsCompleted = completedCount === totalNonBye && totalNonBye > 0

  async function handleSaveChampionshipScore() {
    const score = Number(champScore)
    if (!Number.isInteger(score) || score < 0) {
      toast('Enter a valid non-negative integer', 'error')
      return
    }
    try {
      await setChampionshipScore.mutateAsync({ templateId, totalScore: score })
      toast('Championship score saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save score', 'error')
    }
  }

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
                          {isCompleted && m.score_top != null && m.score_bottom != null && (
                            <span className="text-text-muted text-xs ml-1">({m.score_top} - {m.score_bottom})</span>
                          )}
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
                        <div className="mt-3 space-y-2">
                          <div className="flex gap-2 items-center text-xs text-text-muted">
                            <div className="flex-1 flex items-center gap-1">
                              <span className="truncate">{m.team_top}</span>
                              <input
                                type="number"
                                min={0}
                                value={scores[m.id]?.top ?? ''}
                                onChange={(e) => setScores((s) => ({ ...s, [m.id]: { ...s[m.id], top: e.target.value } }))}
                                placeholder="Score"
                                className="w-16 bg-bg-input border border-border rounded px-2 py-1 text-text-primary text-xs focus:outline-none focus:border-accent"
                              />
                            </div>
                            <div className="flex-1 flex items-center gap-1">
                              <span className="truncate">{m.team_bottom}</span>
                              <input
                                type="number"
                                min={0}
                                value={scores[m.id]?.bottom ?? ''}
                                onChange={(e) => setScores((s) => ({ ...s, [m.id]: { ...s[m.id], bottom: e.target.value } }))}
                                placeholder="Score"
                                className="w-16 bg-bg-input border border-border rounded px-2 py-1 text-text-primary text-xs focus:outline-none focus:border-accent"
                              />
                            </div>
                            <span className="text-[10px] italic shrink-0">(optional)</span>
                          </div>
                          <div className="flex gap-2">
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
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Championship Total Score (tiebreaker) */}
      {allMatchupsCompleted && (
        <div className="mt-6 bg-bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-2">Championship Total Score (Tiebreaker)</h3>
          <p className="text-xs text-text-muted mb-3">
            Enter the combined final score of the championship game. This will be used to break ties across all tournaments using this template.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              value={champScore}
              onChange={(e) => setChampScore(e.target.value)}
              placeholder="e.g. 145"
              min={0}
              className="flex-1 bg-bg-input border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleSaveChampionshipScore}
              disabled={!champScore || setChampionshipScore.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {setChampionshipScore.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
