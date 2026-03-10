import { useState, useMemo, useCallback, useRef } from 'react'
import { useSubmitBracket, useMyOtherBracketEntries } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'

export default function BracketPicker({ league, tournament, matchups, existingPicks, existingTiebreakerScore, onClose }) {
  const submitBracket = useSubmitBracket()
  const { data: otherEntries } = useMyOtherBracketEntries(league?.id)
  const [entryName, setEntryName] = useState('')
  const [tiebreakerScore, setTiebreakerScore] = useState(existingTiebreakerScore ?? '')
  const [copiedFrom, setCopiedFrom] = useState(null)
  const autoAdvanceTimer = useRef(null)

  // Template matchups for feeds_into info
  const templateMatchups = useMemo(
    () => tournament?.bracket_templates?.matchups || [],
    [tournament?.bracket_templates?.matchups]
  )

  // Build lookup maps
  const templateMatchupMap = useMemo(() => {
    const map = {}
    for (const tm of templateMatchups) {
      map[tm.id] = tm
    }
    return map
  }, [templateMatchups])

  // Initialize picks from existing or empty
  const [picks, setPicks] = useState(() => {
    if (existingPicks?.length) {
      const map = {}
      for (const p of existingPicks) {
        map[p.template_matchup_id] = p.picked_team
      }
      return map
    }
    return {}
  })

  const rounds = tournament?.bracket_templates?.rounds || []
  const regions = tournament?.bracket_templates?.regions || []

  function getRoundName(roundNum) {
    const r = rounds.find((r) => r.round_number === roundNum)
    return r?.name || `Round ${roundNum}`
  }

  function getRoundPoints(roundNum) {
    const r = rounds.find((r) => r.round_number === roundNum)
    return r?.points_per_correct || 0
  }

  // Settled Round 0 matchups (already have a winner) don't need picks at all
  const settledPlayInIds = useMemo(() => new Set(
    (matchups || []).filter((m) => m.round_number === 0 && m.winner).map((m) => m.template_matchup_id)
  ), [matchups])

  // Build wizard steps from matchup data
  const steps = useMemo(() => {
    const allMatchups = matchups || []
    const grouped = {}
    for (const m of allMatchups) {
      if (!grouped[m.round_number]) grouped[m.round_number] = []
      grouped[m.round_number].push(m)
    }
    for (const key in grouped) {
      grouped[key].sort((a, b) => a.position - b.position)
    }

    const roundNums = Object.keys(grouped).map(Number).sort((a, b) => a - b)
    const hasRegions = regions.length > 1
    const result = []

    for (const roundNum of roundNums) {
      const roundMatchups = grouped[roundNum]
      const isPlayIn = roundNum === 0

      // Split rounds 1-2 by region when regions exist and there are enough matchups
      if (hasRegions && (roundNum === 1 || roundNum === 2) && roundMatchups.length > regions.length) {
        for (const region of regions) {
          const regionMatchups = roundMatchups.filter((m) => m.region === region)
          if (regionMatchups.length > 0) {
            result.push({
              roundNum,
              region,
              label: `${getRoundName(roundNum)} — ${region}`,
              matchups: regionMatchups,
              isBonus: false,
            })
          }
        }
        // Include any matchups without a region (shouldn't happen, but safe fallback)
        const noRegion = roundMatchups.filter((m) => !m.region || !regions.includes(m.region))
        if (noRegion.length > 0) {
          result.push({
            roundNum,
            region: null,
            label: getRoundName(roundNum),
            matchups: noRegion,
            isBonus: false,
          })
        }
      } else {
        // Round 0 (play-in), rounds 3+ (Sweet 16 onward), or small brackets: one step per round
        result.push({
          roundNum,
          region: null,
          label: isPlayIn ? `${getRoundName(roundNum)} (Bonus)` : getRoundName(roundNum),
          matchups: roundMatchups,
          isBonus: isPlayIn,
        })
      }
    }

    return result
  }, [matchups, regions, rounds])

  // Helper: get pickable matchups for a step
  const getPickableMatchups = useCallback((step) => {
    return step.matchups.filter((m) => {
      if (templateMatchupMap[m.template_matchup_id]?.is_bye) return false
      if (step.isBonus && settledPlayInIds.has(m.template_matchup_id)) return false
      return true
    })
  }, [templateMatchupMap, settledPlayInIds])

  // Helper: check if a step is complete given a picks object
  const isStepComplete = useCallback((step, picksObj) => {
    const pickable = getPickableMatchups(step)
    if (pickable.length === 0) return true
    return pickable.every((m) => picksObj[m.template_matchup_id])
  }, [getPickableMatchups])

  // Find first incomplete step for initial position
  const initialStep = useMemo(() => {
    if (steps.length === 0) return 0
    const firstIncomplete = steps.findIndex((step) => !isStepComplete(step, picks))
    return firstIncomplete === -1 ? 0 : firstIncomplete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only compute on mount

  const [activeStep, setActiveStep] = useState(initialStep)
  const currentStep = steps[activeStep] || steps[0]

  // Get the available teams for a matchup (from feeder picks or direct team names)
  const getTeamsForMatchup = useCallback((matchup) => {
    const tm = templateMatchupMap[matchup.template_matchup_id]
    if (!tm) return { top: matchup.team_top, bottom: matchup.team_bottom }

    // Find feeder matchups for each slot
    const feeders = templateMatchups.filter((f) => f.feeds_into_matchup_id === tm.id)
    const topFeeder = feeders.find((f) => f.feeds_into_slot === 'top')
    const bottomFeeder = feeders.find((f) => f.feeds_into_slot === 'bottom')

    return {
      top: topFeeder ? (picks[topFeeder.id] || null) : matchup.team_top,
      bottom: bottomFeeder ? (picks[bottomFeeder.id] || null) : matchup.team_bottom,
    }
  }, [picks, templateMatchupMap, templateMatchups])

  // Handle picking a team
  function handlePick(matchup, team) {
    const tmId = matchup.template_matchup_id
    const currentPick = picks[tmId]

    if (currentPick === team) return // Already picked

    const newPicks = { ...picks, [tmId] : team }

    // If changing a pick, clear dependent downstream picks
    if (currentPick) {
      clearDownstreamPicks(tmId, currentPick, newPicks)
    }

    setPicks(newPicks)

    // Auto-advance if current step is now complete (non-bonus only)
    if (currentStep && !currentStep.isBonus && activeStep < steps.length - 1) {
      if (isStepComplete(currentStep, newPicks)) {
        // Clear any existing timer
        if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current)
        autoAdvanceTimer.current = setTimeout(() => {
          setActiveStep((prev) => Math.min(prev + 1, steps.length - 1))
          autoAdvanceTimer.current = null
        }, 400)
      }
    }
  }

  function clearDownstreamPicks(tmId, oldTeam, newPicks) {
    // Find matchups that this one feeds into
    const tm = templateMatchupMap[tmId]
    if (!tm?.feeds_into_matchup_id) return

    const nextTmId = tm.feeds_into_matchup_id
    // If the next round pick was the team that was just changed, clear it
    if (newPicks[nextTmId] === oldTeam) {
      delete newPicks[nextTmId]
      clearDownstreamPicks(nextTmId, oldTeam, newPicks)
    }
  }

  // Copy picks from another entry
  function handleCopyBracket(entry) {
    const newPicks = {}
    for (const p of entry.picks) {
      newPicks[p.template_matchup_id] = p.picked_team
    }
    setPicks(newPicks)
    setCopiedFrom(entry.league_name)
    setActiveStep(0) // Start at step 0 to review
    toast(`Bracket copied from ${entry.league_name}`, 'success')
  }

  // Show copy option when user has other entries and hasn't started picking
  const hasStartedPicking = Object.keys(picks).length > 0
  const availableEntries = !existingPicks?.length && !hasStartedPicking && !copiedFrom
    ? (otherEntries || [])
    : []

  // Count filled picks vs required matchups (Round 0 play-in picks are optional bonus)
  const nonByeMatchups = (matchups || []).filter((m) => {
    const tm = templateMatchupMap[m.template_matchup_id]
    return !tm?.is_bye
  })
  const requiredMatchups = nonByeMatchups.filter((m) => {
    const tm = templateMatchupMap[m.template_matchup_id]
    return m.round_number >= 1 && !tm?.is_bye
  })
  const filledCount = Object.keys(picks).length
  const totalRequired = requiredMatchups.length
  const allFilled = filledCount >= totalRequired
  const tiebreakerValid = tiebreakerScore !== '' && Number.isInteger(Number(tiebreakerScore)) && Number(tiebreakerScore) >= 0 && Number(tiebreakerScore) <= 500
  const canSubmit = allFilled && tiebreakerValid

  async function handleSubmit() {
    const pickArray = Object.entries(picks).map(([template_matchup_id, picked_team]) => ({
      template_matchup_id,
      picked_team,
    }))

    try {
      await submitBracket.mutateAsync({
        leagueId: league.id,
        picks: pickArray,
        entryName: entryName || undefined,
        tiebreakerScore: Number(tiebreakerScore),
      })
      toast('Bracket submitted!', 'success')
      onClose?.()
    } catch (err) {
      toast(err.message || 'Failed to submit bracket', 'error')
    }
  }

  // Step completion stats for navigator
  const stepPickable = currentStep ? getPickableMatchups(currentStep) : []
  const stepFilled = stepPickable.filter((m) => picks[m.template_matchup_id]).length
  const stepTotal = stepPickable.length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl">Fill Your Bracket</h2>
        <button
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>

      {/* Progress */}
      <div className="bg-bg-card rounded-xl border border-border p-3 mb-4 text-center">
        <div className="text-sm">
          <span className="font-semibold text-accent">{Math.min(filledCount, totalRequired)}</span>
          <span className="text-text-muted"> / {totalRequired} required picks made</span>
        </div>
        <div className="w-full bg-bg-input rounded-full h-1.5 mt-2">
          <div
            className="bg-accent rounded-full h-1.5 transition-all"
            style={{ width: `${totalRequired > 0 ? Math.min((filledCount / totalRequired) * 100, 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Copy from existing bracket */}
      {availableEntries.length > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 mb-4">
          <p className="text-sm text-text-secondary mb-2">
            You have {availableEntries.length === 1 ? 'a bracket' : 'brackets'} from another league. Copy picks to get started?
          </p>
          <div className="space-y-2">
            {availableEntries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => handleCopyBracket(entry)}
                className="w-full flex items-center justify-between px-3 py-2 bg-bg-card rounded-lg border border-border hover:border-accent transition-colors text-sm"
              >
                <span className="text-text-primary font-medium truncate">{entry.league_name}</span>
                <span className="shrink-0 ml-2 text-xs text-accent font-semibold">Use Bracket</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {copiedFrom && (
        <div className="bg-correct/10 border border-correct/30 rounded-xl px-3 py-2 mb-4 text-sm text-correct text-center">
          Copied from {copiedFrom} — review and edit before submitting
        </div>
      )}

      {/* Step navigator */}
      {steps.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setActiveStep((s) => Math.max(s - 1, 0))}
            disabled={activeStep === 0}
            className="p-2 rounded-lg text-text-secondary hover:bg-bg-card-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="text-center min-w-0 flex-1 px-2">
            <div className="font-display text-sm truncate">{currentStep?.label}</div>
            <div className="text-[11px] text-text-muted mt-0.5">
              Step {activeStep + 1} of {steps.length}
              {stepTotal > 0 && (
                <span className={stepFilled === stepTotal ? ' text-correct' : ''}>
                  {' '}&middot; {stepFilled}/{stepTotal} picked
                </span>
              )}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {currentStep?.isBonus
                ? '(bonus — not required to submit)'
                : `${getRoundPoints(currentStep?.roundNum)} pts per correct pick`
              }
            </div>
          </div>
          <button
            onClick={() => setActiveStep((s) => Math.min(s + 1, steps.length - 1))}
            disabled={activeStep === steps.length - 1}
            className="p-2 rounded-lg text-text-secondary hover:bg-bg-card-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Matchups for active step */}
      <div className="space-y-3">
        {currentStep?.matchups.map((matchup) => {
          const tm = templateMatchupMap[matchup.template_matchup_id]
          if (tm?.is_bye) return null

          // Settled Round 0 matchups: show result as locked, not pickable
          if (matchup.round_number === 0 && matchup.winner) {
            return (
              <div key={matchup.id} className="bg-bg-card rounded-xl border border-border overflow-hidden opacity-70">
                {matchup.region && !currentStep.region && (
                  <div className="text-[10px] text-text-muted text-center pt-2">{matchup.region}</div>
                )}
                <div className="px-3 py-1 text-[10px] text-text-muted text-center">Result</div>
                <div className="p-1">
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm">
                    {matchup.seed_top != null && (
                      <span className="text-xs text-text-muted w-5 text-right">{matchup.seed_top}</span>
                    )}
                    <span className={`flex-1 text-left truncate ${matchup.winner === 'top' ? 'text-correct font-semibold' : 'text-text-muted line-through'}`}>
                      {matchup.team_top}
                    </span>
                  </div>
                  <div className="border-t border-border mx-3" />
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm">
                    {matchup.seed_bottom != null && (
                      <span className="text-xs text-text-muted w-5 text-right">{matchup.seed_bottom}</span>
                    )}
                    <span className={`flex-1 text-left truncate ${matchup.winner === 'bottom' ? 'text-correct font-semibold' : 'text-text-muted line-through'}`}>
                      {matchup.team_bottom}
                    </span>
                  </div>
                </div>
              </div>
            )
          }

          const { top, bottom } = getTeamsForMatchup(matchup)
          const currentPick = picks[matchup.template_matchup_id]

          return (
            <div key={matchup.id} className="bg-bg-card rounded-xl border border-border overflow-hidden">
              {matchup.region && !currentStep.region && (
                <div className="text-[10px] text-text-muted text-center pt-2">{matchup.region}</div>
              )}
              <div className="p-1">
                <button
                  onClick={() => top && handlePick(matchup, top)}
                  disabled={!top}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    currentPick === top && top
                      ? 'bg-accent/20 border border-accent text-accent font-semibold'
                      : top
                        ? 'hover:bg-bg-card-hover text-text-primary'
                        : 'text-text-muted cursor-not-allowed'
                  }`}
                >
                  {matchup.seed_top != null && (
                    <span className="text-xs text-text-muted w-5 text-right">{matchup.seed_top}</span>
                  )}
                  <span className="flex-1 text-left truncate">{top || 'Waiting...'}</span>
                  {currentPick === top && top && (
                    <span className="text-accent text-xs">Selected</span>
                  )}
                </button>
                <div className="border-t border-border mx-3" />
                <button
                  onClick={() => bottom && handlePick(matchup, bottom)}
                  disabled={!bottom}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    currentPick === bottom && bottom
                      ? 'bg-accent/20 border border-accent text-accent font-semibold'
                      : bottom
                        ? 'hover:bg-bg-card-hover text-text-primary'
                        : 'text-text-muted cursor-not-allowed'
                  }`}
                >
                  {matchup.seed_bottom != null && (
                    <span className="text-xs text-text-muted w-5 text-right">{matchup.seed_bottom}</span>
                  )}
                  <span className="flex-1 text-left truncate">{bottom || 'Waiting...'}</span>
                  {currentPick === bottom && bottom && (
                    <span className="text-accent text-xs">Selected</span>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Entry name + Tiebreaker + Submit */}
      <div className="mt-6 space-y-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">
            Bracket Name <span className="text-text-muted">(optional)</span>
          </label>
          <input
            type="text"
            value={entryName}
            onChange={(e) => setEntryName(e.target.value)}
            placeholder="My Bracket"
            maxLength={50}
            className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">
            Championship Total Score Prediction <span className="text-incorrect">*</span>
          </label>
          <input
            type="number"
            value={tiebreakerScore}
            onChange={(e) => setTiebreakerScore(e.target.value)}
            placeholder="e.g. 145"
            min={0}
            max={500}
            className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
          <p className="text-[10px] text-text-muted mt-1">
            Predict the combined final score of the championship game (tiebreaker)
          </p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitBracket.isPending}
          className="w-full py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitBracket.isPending
            ? 'Submitting...'
            : !allFilled
              ? `Pick ${totalRequired - Math.min(filledCount, totalRequired)} more games`
              : !tiebreakerValid
                ? 'Enter tiebreaker score'
                : 'Submit Bracket'}
        </button>
      </div>
    </div>
  )
}
