import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useSubmitBracket, useMyOtherBracketEntries } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import BracketDisplay from './BracketDisplay'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'

function PickerTeamLogo({ team, sportKey }) {
  const [src, setSrc] = useState(() => getTeamLogoUrl(team, sportKey))
  const [hidden, setHidden] = useState(false)
  useEffect(() => { setSrc(getTeamLogoUrl(team, sportKey)); setHidden(false) }, [team, sportKey])
  if (!src || hidden) return null
  return <img src={src} alt="" className="w-5 h-5 object-contain shrink-0" onError={() => {
    const fallback = getTeamLogoFallbackUrl(team, sportKey)
    if (fallback && fallback !== src) setSrc(fallback)
    else setHidden(true)
  }} />
}

export default function BracketPicker({ league, tournament, matchups, existingPicks, existingTiebreakerScore, onClose, ffOnlyMode = false }) {
  const submitBracket = useSubmitBracket()
  const { data: otherEntries } = useMyOtherBracketEntries(league?.id)
  const draftKey = `bracket-draft-${league?.id}`

  // Restore saved draft from localStorage
  const savedDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }, [draftKey])

  const [entryName, setEntryName] = useState(savedDraft?.entryName || '')
  const [tiebreakerTop, setTiebreakerTop] = useState(savedDraft?.tiebreakerTop || '')
  const [tiebreakerBottom, setTiebreakerBottom] = useState(savedDraft?.tiebreakerBottom || '')
  const [copiedFrom, setCopiedFrom] = useState(null)
  const [showOverview, setShowOverview] = useState(false)
  const [championModal, setChampionModal] = useState(null) // { team, seed }
  const autoAdvanceTimer = useRef(null)

  // Template matchups for feeds_into info
  const templateMatchups = useMemo(
    () => tournament?.bracket_templates?.bracket_template_matchups || [],
    [tournament?.bracket_templates?.bracket_template_matchups]
  )

  // Build lookup maps
  const templateMatchupMap = useMemo(() => {
    const map = {}
    for (const tm of templateMatchups) {
      map[tm.id] = tm
    }
    return map
  }, [templateMatchups])

  // Initialize picks from existing entry, saved draft, or empty
  // Filter to only include valid template matchup IDs (orphaned matchups from template regeneration are excluded)
  const [picks, setPicks] = useState(() => {
    let raw = {}
    if (existingPicks?.length) {
      for (const p of existingPicks) {
        raw[p.template_matchup_id] = p.picked_team
      }
    } else if (savedDraft?.picks && Object.keys(savedDraft.picks).length > 0) {
      raw = savedDraft.picks
    }
    // Strip orphaned picks
    const cleaned = {}
    for (const [tmId, team] of Object.entries(raw)) {
      if (templateMatchupMap[tmId]) cleaned[tmId] = team
    }
    return cleaned
  })

  const rounds = tournament?.bracket_templates?.rounds || []
  const regions = tournament?.bracket_templates?.regions || []
  const isBestOf7 = tournament?.bracket_templates?.series_format === 'best_of_7'

  // Series length predictions (4/5/6/7) for best_of_7 brackets
  const [seriesLengths, setSeriesLengths] = useState(() => {
    if (!isBestOf7) return {}
    const map = {}
    if (existingPicks?.length) {
      for (const p of existingPicks) {
        if (p.series_length) map[p.template_matchup_id] = p.series_length
      }
    } else if (savedDraft?.seriesLengths) {
      return savedDraft.seriesLengths
    }
    return map
  })

  // Auto-save draft to localStorage
  useEffect(() => {
    if (Object.keys(picks).length === 0 && !entryName && !tiebreakerTop && !tiebreakerBottom) return
    try {
      localStorage.setItem(draftKey, JSON.stringify({ picks, entryName, tiebreakerTop, tiebreakerBottom, seriesLengths }))
    } catch {}
  }, [picks, entryName, tiebreakerTop, tiebreakerBottom, seriesLengths, draftKey])

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

  // Build wizard steps from matchup data (exclude orphaned matchups without valid template entries)
  const steps = useMemo(() => {
    const tmMap = {}
    for (const tm of templateMatchups) tmMap[tm.id] = tm
    const allMatchups = (matchups || []).filter((m) => {
      const tm = tmMap[m.template_matchup_id]
      return tm && !tm.is_bye
    })
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

    if (ffOnlyMode) {
      const maxRound = Math.max(...roundNums.filter((r) => r > 0))
      const ffMin = maxRound - 1
      return result.filter((s) => s.roundNum >= ffMin)
    }

    return result
  }, [matchups, regions, rounds, templateMatchups, ffOnlyMode])

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
    return pickable.every((m) => picksObj[m.template_matchup_id] && (!isBestOf7 || seriesLengths[m.template_matchup_id]))
  }, [getPickableMatchups, isBestOf7, seriesLengths])

  // Find first incomplete step for initial position
  const initialStep = useMemo(() => {
    if (steps.length === 0) return 0
    const firstIncomplete = steps.findIndex((step) => !isStepComplete(step, picks))
    return firstIncomplete === -1 ? 0 : firstIncomplete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only compute on mount

  const [activeStep, setActiveStep] = useState(initialStep)
  const currentStep = steps[activeStep] || steps[0]

  // Build feeder map: for each matchup, which two previous-round matchups feed into it?
  // Uses template feeds_into links when available, falls back to position-based pairing
  const feederMap = useMemo(() => {
    const map = {} // matchup.id -> { top: matchup, bottom: matchup }
    const all = matchups || []

    // First try template-based feeds_into links
    const tmIdToMatchup = {}
    for (const m of all) {
      if (m.template_matchup_id) tmIdToMatchup[m.template_matchup_id] = m
    }

    for (const m of all) {
      if (m.round_number === 0) continue // play-ins handled separately
      const tm = templateMatchupMap[m.template_matchup_id]
      if (tm) {
        const feeders = templateMatchups.filter((f) => f.feeds_into_matchup_id === tm.id)
        const topFeeder = feeders.find((f) => f.feeds_into_slot === 'top')
        const bottomFeeder = feeders.find((f) => f.feeds_into_slot === 'bottom')
        if (topFeeder || bottomFeeder) {
          map[m.id] = {
            top: topFeeder ? tmIdToMatchup[topFeeder.id] : null,
            bottom: bottomFeeder ? tmIdToMatchup[bottomFeeder.id] : null,
          }
        }
      }
    }

    // Position-based fallback for any matchups without feeders
    // Group by round, sort by position within same region grouping
    const byRound = {}
    for (const m of all) {
      if (!byRound[m.round_number]) byRound[m.round_number] = []
      byRound[m.round_number].push(m)
    }
    for (const key in byRound) {
      byRound[key].sort((a, b) => a.position - b.position)
    }

    for (const m of all) {
      if (map[m.id]) continue // already resolved via template
      if (m.round_number <= 0) continue // skip play-ins (handled by template links)
      if (m.round_number === 1) continue // round 1 has direct teams, no position-based feeders

      const prevRound = byRound[m.round_number - 1]
      if (!prevRound?.length) continue

      // For within-region rounds, filter to same region
      const prevMatchups = m.region
        ? prevRound.filter((p) => p.region === m.region)
        : prevRound // cross-region: use all previous round matchups

      const myRound = byRound[m.round_number]
      const sameGroup = m.region
        ? myRound.filter((p) => p.region === m.region)
        : myRound
      const myIdx = sameGroup.indexOf(m)

      // Each matchup in this round is fed by 2 consecutive matchups from prev round
      const topFeeder = prevMatchups[myIdx * 2]
      const bottomFeeder = prevMatchups[myIdx * 2 + 1]

      if (topFeeder || bottomFeeder) {
        map[m.id] = { top: topFeeder || null, bottom: bottomFeeder || null }
      }
    }

    return map
  }, [matchups, templateMatchupMap, templateMatchups])

  // Team → seed lookup from Round 1 matchups (seeds are only set on Round 1)
  const teamSeedMap = useMemo(() => {
    const map = {}
    for (const m of matchups || []) {
      if (m.round_number <= 1 && m.team_top && m.seed_top != null) map[m.team_top] = m.seed_top
      if (m.round_number <= 1 && m.team_bottom && m.seed_bottom != null) map[m.team_bottom] = m.seed_bottom
    }
    return map
  }, [matchups])

  // Get the available teams for a matchup (from feeder picks, settled results, or direct team names)
  // Returns { top, bottom, seedTop, seedBottom }
  const getTeamsForMatchup = useCallback((matchup) => {
    const feeders = feederMap[matchup.id]
    if (!feeders) return { top: matchup.team_top, bottom: matchup.team_bottom, seedTop: matchup.seed_top ?? teamSeedMap[matchup.team_top], seedBottom: matchup.seed_bottom ?? teamSeedMap[matchup.team_bottom] }

    function resolveFeeder(feederMatchup, fallbackTeam) {
      if (!feederMatchup) return fallbackTeam
      // User's pick takes priority
      if (feederMatchup.template_matchup_id && picks[feederMatchup.template_matchup_id]) {
        return picks[feederMatchup.template_matchup_id]
      }
      // Fallback: if feeder game is settled in the tournament, use the winner
      if (feederMatchup.winner) {
        return feederMatchup.winner === 'top' ? feederMatchup.team_top : feederMatchup.team_bottom
      }
      return null
    }

    const top = resolveFeeder(feeders.top, matchup.team_top)
    const bottom = resolveFeeder(feeders.bottom, matchup.team_bottom)

    return {
      top,
      bottom,
      seedTop: top ? (matchup.seed_top ?? teamSeedMap[top] ?? null) : null,
      seedBottom: bottom ? (matchup.seed_bottom ?? teamSeedMap[bottom] ?? null) : null,
    }
  }, [picks, feederMap, teamSeedMap])

  // Forward lookup: template_matchup_id → next round's template_matchup_id (for clearing downstream picks)
  const feedsIntoTmId = useMemo(() => {
    const map = {}
    const all = matchups || []
    const byId = {}
    for (const m of all) byId[m.id] = m
    for (const [matchupId, feeders] of Object.entries(feederMap)) {
      const m = byId[matchupId]
      if (!m?.template_matchup_id) continue
      if (feeders.top?.template_matchup_id) map[feeders.top.template_matchup_id] = m.template_matchup_id
      if (feeders.bottom?.template_matchup_id) map[feeders.bottom.template_matchup_id] = m.template_matchup_id
    }
    return map
  }, [feederMap, matchups])

  // Championship matchup for tiebreaker team names
  const championshipMatchup = useMemo(() => {
    if (!matchups?.length) return null
    const maxRound = Math.max(...matchups.filter((m) => m.round_number > 0).map((m) => m.round_number))
    return matchups.find((m) => m.round_number === maxRound) || null
  }, [matchups])

  const championshipTeams = useMemo(() => {
    if (!championshipMatchup) return { top: null, bottom: null }
    return getTeamsForMatchup(championshipMatchup)
  }, [championshipMatchup, getTeamsForMatchup])

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
    // Find the next round matchup this one feeds into
    const nextTmId = feedsIntoTmId[tmId]
    if (!nextTmId) return

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

  // Count filled picks vs total pickable matchups
  const allPickableMatchups = (matchups || []).filter((m) => {
    const tm = templateMatchupMap[m.template_matchup_id]
    if (!tm || tm.is_bye) return false
    // Settled play-in games don't need picks
    if (m.round_number === 0 && m.winner) return false
    return true
  })
  const filledCount = allPickableMatchups.filter((m) => picks[m.template_matchup_id]).length
  const totalRequired = allPickableMatchups.length
  const allFilled = filledCount >= totalRequired
  const tiebreakerTopValid = tiebreakerTop !== '' && Number.isInteger(Number(tiebreakerTop)) && Number(tiebreakerTop) >= 0 && Number(tiebreakerTop) <= 250
  const tiebreakerBottomValid = tiebreakerBottom !== '' && Number.isInteger(Number(tiebreakerBottom)) && Number(tiebreakerBottom) >= 0 && Number(tiebreakerBottom) <= 250
  const tiebreakerValid = tiebreakerTopValid && tiebreakerBottomValid
  const allSeriesLengthsFilled = !isBestOf7 || allPickableMatchups.every((m) => seriesLengths[m.template_matchup_id])
  const canSubmit = allFilled && tiebreakerValid && allSeriesLengthsFilled

  async function handleSubmit() {
    // Only submit picks for valid, non-bye template matchup IDs
    const validTmIds = new Set(allPickableMatchups.map((m) => m.template_matchup_id))
    const pickArray = Object.entries(picks)
      .filter(([tmId]) => validTmIds.has(tmId))
      .map(([template_matchup_id, picked_team]) => ({
        template_matchup_id,
        picked_team,
        ...(isBestOf7 && seriesLengths[template_matchup_id] ? { series_length: seriesLengths[template_matchup_id] } : {}),
      }))

    try {
      await submitBracket.mutateAsync({
        leagueId: league.id,
        picks: pickArray,
        entryName: entryName || undefined,
        tiebreakerScore: Number(tiebreakerTop) + Number(tiebreakerBottom),
      })
      localStorage.removeItem(draftKey)

      // Show champion celebration modal
      if (championshipMatchup) {
        const champPick = picks[championshipMatchup.template_matchup_id]
        if (champPick) {
          const seed = teamSeedMap[champPick] ?? null
          setChampionModal({ team: champPick, seed })
          return // Don't close yet — modal will close and then call onClose
        }
      }
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

      {/* Draft restored indicator */}
      {!existingPicks?.length && savedDraft?.picks && Object.keys(savedDraft.picks).length > 0 && !copiedFrom && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl px-3 py-2 mb-4 text-sm text-accent text-center">
          Draft restored — your progress was saved
        </div>
      )}

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
          {!showOverview && (
            <button
              onClick={() => setActiveStep((s) => Math.max(s - 1, 0))}
              disabled={activeStep === 0}
              className="p-2 rounded-lg text-text-secondary hover:bg-bg-card-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <div className="text-center min-w-0 flex-1 px-2">
            {showOverview ? (
              <div className="font-display text-sm">Bracket Overview</div>
            ) : (
              <>
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
                    : isBestOf7
                      ? `${getRoundPoints(currentStep?.roundNum)} pts + series bonus (+2 exact, +1 one-off)`
                      : `${getRoundPoints(currentStep?.roundNum)} pts per correct pick`
                  }
                </div>
              </>
            )}
          </div>
          {!showOverview && (
            <button
              onClick={() => setActiveStep((s) => Math.min(s + 1, steps.length - 1))}
              disabled={activeStep === steps.length - 1}
              className="p-2 rounded-lg text-text-secondary hover:bg-bg-card-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowOverview((v) => !v)}
            className={`p-2 rounded-lg transition-colors ${showOverview ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-bg-card-hover'}`}
            title={showOverview ? 'Back to step view' : 'Bracket overview'}
          >
            {showOverview ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Overview mode: full bracket */}
      {showOverview && (
        <div className="mb-4">
          <BracketDisplay
            matchups={(matchups || []).map((m) => {
              const resolved = getTeamsForMatchup(m)
              return {
                ...m,
                team_top: resolved.top || m.team_top,
                team_bottom: resolved.bottom || m.team_bottom,
              }
            })}
            picks={Object.entries(picks).map(([tmId, picked_team]) => ({
              template_matchup_id: tmId,
              picked_team,
            }))}
            rounds={rounds}
            regions={regions}
            seriesFormat={tournament?.bracket_templates?.series_format}
            sportKey={league.sport}
            initialRegion={currentStep?.region || null}
            onMatchupTap={(matchup) => {
              const stepIdx = steps.findIndex((s) =>
                s.matchups.some((m) => m.id === matchup.id)
              )
              if (stepIdx !== -1) {
                setActiveStep(stepIdx)
                setShowOverview(false)
              }
            }}
          />
          <p className="text-[10px] text-text-muted text-center mt-2">
            Tap any matchup to jump to that step
          </p>
        </div>
      )}

      {/* Matchups for active step */}
      {!showOverview && <div className="space-y-3">
        {currentStep?.matchups.map((matchup) => {
          const tm = templateMatchupMap[matchup.template_matchup_id]
          if (!tm || tm.is_bye) return null

          // Settled Round 0 matchups: show result as locked, not pickable
          if (matchup.round_number === 0 && matchup.winner) {
            return (
              <div key={matchup.id} className="bg-bg-primary rounded-xl border border-text-primary/20 overflow-hidden opacity-70">
                {matchup.region && !currentStep.region && (
                  <div className="text-[10px] text-text-muted text-center pt-2">{matchup.region}</div>
                )}
                <div className="px-3 py-1 text-[10px] text-text-muted text-center">Result</div>
                <div className="p-1">
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm">
                    <PickerTeamLogo team={matchup.team_top} sportKey={league.sport} />
                    {matchup.seed_top != null && (
                      <span className="text-xs text-text-muted w-5 text-right">{matchup.seed_top}</span>
                    )}
                    <span className={`flex-1 text-left truncate ${matchup.winner === 'top' ? 'text-correct font-semibold' : 'text-text-muted line-through'}`}>
                      {matchup.team_top}
                    </span>
                  </div>
                  <div className="border-t border-text-primary/10 mx-3" />
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm">
                    <PickerTeamLogo team={matchup.team_bottom} sportKey={league.sport} />
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

          const { top, bottom, seedTop, seedBottom } = getTeamsForMatchup(matchup)
          const currentPick = picks[matchup.template_matchup_id]

          return (
            <div key={matchup.id} className="bg-bg-primary rounded-xl border border-text-primary/20 overflow-hidden">
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
                        ? 'hover:bg-text-primary/5 text-text-primary'
                        : 'text-text-muted cursor-not-allowed'
                  }`}
                >
                  <PickerTeamLogo team={top} sportKey={league.sport} />
                  {seedTop != null && (
                    <span className="text-xs text-text-muted w-5 text-right">{seedTop}</span>
                  )}
                  <span className="flex-1 text-left truncate">{top || 'Waiting...'}</span>
                  {currentPick === top && top && (
                    <span className="text-accent text-xs">Selected</span>
                  )}
                </button>
                <div className="border-t border-text-primary/10 mx-3" />
                <button
                  onClick={() => bottom && handlePick(matchup, bottom)}
                  disabled={!bottom}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    currentPick === bottom && bottom
                      ? 'bg-accent/20 border border-accent text-accent font-semibold'
                      : bottom
                        ? 'hover:bg-text-primary/5 text-text-primary'
                        : 'text-text-muted cursor-not-allowed'
                  }`}
                >
                  <PickerTeamLogo team={bottom} sportKey={league.sport} />
                  {seedBottom != null && (
                    <span className="text-xs text-text-muted w-5 text-right">{seedBottom}</span>
                  )}
                  <span className="flex-1 text-left truncate">{bottom || 'Waiting...'}</span>
                  {currentPick === bottom && bottom && (
                    <span className="text-accent text-xs">Selected</span>
                  )}
                </button>
              </div>
              {/* Series length picker for best-of-7 brackets */}
              {isBestOf7 && currentPick && (
                <div className="px-3 pb-2 pt-1">
                  <div className="text-[10px] text-text-muted mb-1.5">Series length</div>
                  <div className="flex gap-1.5">
                    {[4, 5, 6, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => setSeriesLengths((prev) => ({ ...prev, [matchup.template_matchup_id]: n }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          seriesLengths[matchup.template_matchup_id] === n
                            ? 'bg-accent/20 border border-accent text-accent'
                            : 'bg-bg-primary border border-text-primary/20 text-white hover:border-text-primary/40'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Tiebreaker score prediction — shown on championship step */}
        {currentStep && championshipMatchup && currentStep.matchups.some((m) => m.id === championshipMatchup.id) && (
          <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 mt-1">
            <label className="block text-xs text-text-muted mb-2">
              Predict the Final Score <span className="text-incorrect">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  value={tiebreakerTop}
                  onChange={(e) => setTiebreakerTop(e.target.value)}
                  placeholder="Score"
                  min={0}
                  max={250}
                  className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
                <p className="text-[10px] text-text-muted mt-1 truncate text-center">
                  {championshipTeams.top || 'Team 1'}
                </p>
              </div>
              <span className="self-start pt-2.5 text-sm text-text-muted">–</span>
              <div className="flex-1">
                <input
                  type="number"
                  value={tiebreakerBottom}
                  onChange={(e) => setTiebreakerBottom(e.target.value)}
                  placeholder="Score"
                  min={0}
                  max={250}
                  className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
                <p className="text-[10px] text-text-muted mt-1 truncate text-center">
                  {championshipTeams.bottom || 'Team 2'}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-text-muted mt-2">
              Used as tiebreaker for standings
            </p>
          </div>
        )}
      </div>}

      {/* Entry name + Submit */}
      <div className="mt-6 space-y-3">
        <button
          onClick={() => {
            if (!allFilled) {
              // Jump to next incomplete step
              const nextIncomplete = steps.findIndex((step) => !isStepComplete(step, picks))
              if (nextIncomplete !== -1) {
                setActiveStep(nextIncomplete)
                setShowOverview(false)
              }
            } else if (canSubmit) {
              handleSubmit()
            }
          }}
          disabled={(!canSubmit && allFilled) || submitBracket.isPending}
          className="w-full py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitBracket.isPending
            ? 'Submitting...'
            : !allFilled
              ? `Pick ${totalRequired - filledCount} more games`
              : !allSeriesLengthsFilled
                ? 'Predict all series lengths'
                : !tiebreakerValid
                  ? 'Enter championship scores'
                  : 'Submit Bracket'}
        </button>
        {filledCount > 0 && !allFilled && (
          <button
            onClick={() => {
              try {
                localStorage.setItem(draftKey, JSON.stringify({ picks, entryName, tiebreakerTop, tiebreakerBottom }))
                toast('Progress saved! You can pick up where you left off.', 'success')
                onClose?.()
              } catch {
                toast('Failed to save progress', 'error')
              }
            }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover transition-colors"
          >
            Save & Exit
          </button>
        )}
      </div>

      {/* Champion celebration modal */}
      {championModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setChampionModal(null); onClose?.() }}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative bg-bg-secondary rounded-2xl border border-accent/30 p-6 max-w-sm w-full text-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Confetti animation */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full animate-confetti"
                  style={{
                    left: `${Math.random() * 100}%`,
                    backgroundColor: ['#FFD700', '#32CD32', '#FF6347', '#00BFFF', '#FF69B4', '#FFA500'][i % 6],
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: `${2 + Math.random() * 2}s`,
                  }}
                />
              ))}
            </div>

            <div className="relative z-10">
              <div className="text-sm text-text-muted mb-1">{isBestOf7 ? 'Your pick to win the championship is' : 'Your pick to cut the nets down is'}</div>
              <div className="font-display text-3xl text-accent mt-2 mb-1 animate-pulse">
                {championModal.team}
              </div>
              {championModal.seed != null && (
                <div className="text-sm text-text-muted mb-4">
                  {championModal.seed} seed
                </div>
              )}

              <div className="text-6xl my-4">
                {'\u{1F3C6}'}
              </div>

              <div className="space-y-2 mt-6">
                <button
                  onClick={async () => {
                    const shareText = `My pick to win it all: ${championModal.seed ? `(${championModal.seed}) ` : ''}${championModal.team} \u{1F3C6}\n\nFill out your bracket on I KNOW BALL!`
                    if (navigator.share) {
                      try {
                        await navigator.share({ text: shareText, url: 'https://iknowball.club' })
                      } catch {}
                    } else {
                      await navigator.clipboard.writeText(`${shareText}\nhttps://iknowball.club`)
                      toast('Copied to clipboard!', 'success')
                    }
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
                >
                  Share My Champion
                </button>
                <button
                  onClick={() => { setChampionModal(null); onClose?.() }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
