import { useState, useMemo, useCallback } from 'react'
import { useSubmitBracket, useMyOtherBracketEntries } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'

export default function BracketPicker({ league, tournament, matchups, existingPicks, onClose }) {
  const submitBracket = useSubmitBracket()
  const { data: otherEntries } = useMyOtherBracketEntries(league?.id)
  const [entryName, setEntryName] = useState('')
  const [copiedFrom, setCopiedFrom] = useState(null)

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

  // Group matchups by round
  const byRound = useMemo(() => {
    const grouped = {}
    for (const m of matchups || []) {
      if (!grouped[m.round_number]) grouped[m.round_number] = []
      grouped[m.round_number].push(m)
    }
    for (const key in grouped) {
      grouped[key].sort((a, b) => a.position - b.position)
    }
    return grouped
  }, [matchups])

  const roundNumbers = Object.keys(byRound).map(Number).sort((a, b) => a - b)
  const rounds = tournament?.bracket_templates?.rounds || []

  function getRoundName(roundNum) {
    const r = rounds.find((r) => r.round_number === roundNum)
    return r?.name || `Round ${roundNum}`
  }

  function getRoundPoints(roundNum) {
    const r = rounds.find((r) => r.round_number === roundNum)
    return r?.points_per_correct || 0
  }

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
    toast(`Bracket copied from ${entry.league_name}`, 'success')
  }

  // Show copy option when user has other entries and hasn't started picking
  const hasStartedPicking = Object.keys(picks).length > 0
  const availableEntries = !existingPicks?.length && !hasStartedPicking && !copiedFrom
    ? (otherEntries || [])
    : []

  // Count filled picks vs total non-bye matchups
  const nonByeMatchups = (matchups || []).filter((m) => {
    const tm = templateMatchupMap[m.template_matchup_id]
    return !tm?.is_bye
  })
  const filledCount = Object.keys(picks).length
  const totalRequired = nonByeMatchups.length
  const allFilled = filledCount === totalRequired

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
      })
      toast('Bracket submitted!', 'success')
      onClose?.()
    } catch (err) {
      toast(err.message || 'Failed to submit bracket', 'error')
    }
  }

  // Mobile: round-by-round stepper
  const [activeRound, setActiveRound] = useState(roundNumbers[0] || 1)

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
          <span className="font-semibold text-accent">{filledCount}</span>
          <span className="text-text-muted"> / {totalRequired} picks made</span>
        </div>
        <div className="w-full bg-bg-input rounded-full h-1.5 mt-2">
          <div
            className="bg-accent rounded-full h-1.5 transition-all"
            style={{ width: `${totalRequired > 0 ? (filledCount / totalRequired) * 100 : 0}%` }}
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

      {/* Round tabs (mobile stepper) */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {roundNumbers.map((num) => {
          const roundMatchups = byRound[num] || []
          const roundFilled = roundMatchups.filter((m) => picks[m.template_matchup_id]).length
          const roundTotal = roundMatchups.filter((m) => !templateMatchupMap[m.template_matchup_id]?.is_bye).length

          return (
            <button
              key={num}
              onClick={() => setActiveRound(num)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeRound === num
                  ? 'bg-accent text-white'
                  : roundFilled === roundTotal && roundTotal > 0
                    ? 'bg-correct/20 text-correct'
                    : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              {getRoundName(num)}
              {roundTotal > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{roundFilled}/{roundTotal}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Matchups for active round */}
      <div className="space-y-3">
        {byRound[activeRound]?.map((matchup) => {
          const tm = templateMatchupMap[matchup.template_matchup_id]
          if (tm?.is_bye) return null

          const { top, bottom } = getTeamsForMatchup(matchup)
          const currentPick = picks[matchup.template_matchup_id]

          return (
            <div key={matchup.id} className="bg-bg-card rounded-xl border border-border overflow-hidden">
              {matchup.region && (
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

      {/* Round points info */}
      <div className="text-center text-xs text-text-muted mt-3">
        {getRoundPoints(activeRound)} points per correct pick in {getRoundName(activeRound)}
      </div>

      {/* Entry name + Submit */}
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
        <button
          onClick={handleSubmit}
          disabled={!allFilled || submitBracket.isPending}
          className="w-full py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitBracket.isPending ? 'Submitting...' : allFilled ? 'Submit Bracket' : `Pick ${totalRequired - filledCount} more games`}
        </button>
      </div>
    </div>
  )
}
