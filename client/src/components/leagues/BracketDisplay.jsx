import { useMemo, useState } from 'react'

function MatchupCard({ matchup, pick, eliminated, showPick, onTap }) {
  const [showScore, setShowScore] = useState(false)

  const topCorrect = pick && matchup.status === 'completed' && pick === matchup.team_top && matchup.winner === 'top'
  const bottomCorrect = pick && matchup.status === 'completed' && pick === matchup.team_bottom && matchup.winner === 'bottom'
  const topWrong = pick && matchup.status === 'completed' && pick === matchup.team_top && matchup.winner === 'bottom'
  const bottomWrong = pick && matchup.status === 'completed' && pick === matchup.team_bottom && matchup.winner === 'top'

  const hasScores = matchup.status === 'completed' && matchup.score_top != null && matchup.score_bottom != null
  const canExpand = !onTap && hasScores

  function handleClick() {
    if (onTap) return onTap(matchup)
    if (canExpand) setShowScore((s) => !s)
  }

  const isClickable = !!onTap || canExpand

  function teamClass(team, isTop) {
    if (!team) return 'text-text-muted'
    if (showPick && pick === team) {
      if (isTop ? topCorrect : bottomCorrect) return 'text-correct font-semibold'
      if (isTop ? topWrong : bottomWrong) return 'text-incorrect line-through'
      if (eliminated) return 'text-text-muted line-through'
      return 'text-accent font-semibold'
    }
    if (matchup.status === 'completed') {
      const isWinner = (isTop && matchup.winner === 'top') || (!isTop && matchup.winner === 'bottom')
      return isWinner ? 'font-semibold text-text-primary' : 'text-text-muted'
    }
    return 'text-text-primary'
  }

  return (
    <div
      className={`bg-bg-card border border-border rounded-lg w-44 text-xs overflow-hidden${isClickable ? ' cursor-pointer hover:border-accent/50 transition-colors' : ''}`}
      onClick={isClickable ? handleClick : undefined}
    >
      <div className={`flex items-center gap-1 px-2 py-1.5 border-b border-border ${teamClass(matchup.team_top, true)}`}>
        {matchup.seed_top != null && (
          <span className="text-text-muted w-4 text-right shrink-0">{matchup.seed_top}</span>
        )}
        <span className="truncate flex-1">{matchup.team_top || 'TBD'}</span>
        {matchup.status === 'completed' && matchup.winner === 'top' && (
          <span className="text-correct shrink-0">W</span>
        )}
      </div>
      <div className={`flex items-center gap-1 px-2 py-1.5 ${teamClass(matchup.team_bottom, false)}`}>
        {matchup.seed_bottom != null && (
          <span className="text-text-muted w-4 text-right shrink-0">{matchup.seed_bottom}</span>
        )}
        <span className="truncate flex-1">{matchup.team_bottom || 'TBD'}</span>
        {matchup.status === 'completed' && matchup.winner === 'bottom' && (
          <span className="text-correct shrink-0">W</span>
        )}
      </div>
      {showScore && (
        <div className="border-t border-border bg-bg-card-hover px-2 py-1 text-center text-text-muted">
          {matchup.score_top} - {matchup.score_bottom}
        </div>
      )}
    </div>
  )
}

export default function BracketDisplay({ matchups, picks, rounds, regions, onMatchupTap, initialRegion }) {
  const [selectedRegion, setSelectedRegion] = useState(initialRegion ?? null)

  // Build pick lookup by template_matchup_id
  const pickMap = useMemo(() => {
    const map = {}
    for (const p of picks || []) {
      map[p.template_matchup_id] = { team: p.picked_team, eliminated: p.is_eliminated }
    }
    return map
  }, [picks])

  // Group matchups by round (exclude play-in round 0 from full bracket view)
  const byRound = useMemo(() => {
    const grouped = {}
    for (const m of matchups || []) {
      if (m.round_number === 0) continue
      if (!grouped[m.round_number]) grouped[m.round_number] = []
      grouped[m.round_number].push(m)
    }
    // Sort each round by position
    for (const key in grouped) {
      grouped[key].sort((a, b) => a.position - b.position)
    }
    return grouped
  }, [matchups])

  // Filter by region when selected
  const filteredByRound = useMemo(() => {
    if (!selectedRegion) return byRound
    const filtered = {}
    for (const key in byRound) {
      const regionMatchups = byRound[key].filter((m) => m.region === selectedRegion)
      if (regionMatchups.length > 0) filtered[key] = regionMatchups
    }
    return filtered
  }, [byRound, selectedRegion])

  // Build team→seed map from Round 1 matchups (seeds only set on early rounds)
  const teamSeedMap = useMemo(() => {
    const map = {}
    for (const m of matchups || []) {
      if (m.round_number <= 1 && m.team_top && m.seed_top != null) map[m.team_top] = m.seed_top
      if (m.round_number <= 1 && m.team_bottom && m.seed_bottom != null) map[m.team_bottom] = m.seed_bottom
    }
    return map
  }, [matchups])

  // Build position-based feeder map for resolving team names from picks
  const feederMap = useMemo(() => {
    const map = {}
    const all = (matchups || []).filter((m) => m.round_number > 0)
    const byRound = {}
    for (const m of all) {
      if (!byRound[m.round_number]) byRound[m.round_number] = []
      byRound[m.round_number].push(m)
    }
    for (const key in byRound) {
      byRound[key].sort((a, b) => a.position - b.position)
    }
    for (const m of all) {
      if (m.round_number <= 1) continue
      const prevRound = byRound[m.round_number - 1]
      if (!prevRound?.length) continue
      const prevMatchups = m.region ? prevRound.filter((p) => p.region === m.region) : prevRound
      const myRound = byRound[m.round_number]
      const sameGroup = m.region ? myRound.filter((p) => p.region === m.region) : myRound
      const myIdx = sameGroup.indexOf(m)
      map[m.id] = { top: prevMatchups[myIdx * 2] || null, bottom: prevMatchups[myIdx * 2 + 1] || null }
    }
    return map
  }, [matchups])

  // Resolve team names from picks for matchups with null teams
  const resolvedMatchups = useMemo(() => {
    if (!picks?.length) return null

    function resolveFromFeeder(feeder) {
      if (!feeder) return null
      const pick = pickMap[feeder.template_matchup_id]?.team
      if (pick) return pick
      if (feeder.winner === 'top') return feeder.team_top
      if (feeder.winner === 'bottom') return feeder.team_bottom
      return null
    }

    const resolved = {}
    for (const m of matchups || []) {
      if (m.round_number <= 1 || (m.team_top && m.team_bottom)) continue
      const feeders = feederMap[m.id]
      if (!feeders) continue
      const topTeam = m.team_top || resolveFromFeeder(feeders.top)
      const bottomTeam = m.team_bottom || resolveFromFeeder(feeders.bottom)
      resolved[m.id] = {
        team_top: topTeam,
        team_bottom: bottomTeam,
        seed_top: topTeam ? (m.seed_top ?? teamSeedMap[topTeam] ?? null) : null,
        seed_bottom: bottomTeam ? (m.seed_bottom ?? teamSeedMap[bottomTeam] ?? null) : null,
      }
    }
    return resolved
  }, [matchups, picks, pickMap, feederMap, teamSeedMap])

  const roundNumbers = Object.keys(filteredByRound).map(Number).sort((a, b) => a - b)
  const firstRoundCount = filteredByRound[roundNumbers[0]]?.length || 0

  function getRoundName(roundNum) {
    const r = (rounds || []).find((r) => r.round_number === roundNum)
    return r?.name || `Round ${roundNum}`
  }

  function getRoundPoints(roundNum) {
    const r = (rounds || []).find((r) => r.round_number === roundNum)
    return r?.points_per_correct || 0
  }

  const hasPicks = picks && picks.length > 0
  const showRegionTabs = regions && regions.length >= 2

  // Desktop horizontal view
  return (
    <div>
      {/* Region tabs */}
      {showRegionTabs && (
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedRegion(null)}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              !selectedRegion ? 'bg-accent/20 text-accent' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            All
          </button>
          {regions.map((region) => (
            <button
              key={region}
              onClick={() => setSelectedRegion(region)}
              className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                selectedRegion === region ? 'bg-accent/20 text-accent' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              {region}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-max py-2">
          {roundNumbers.map((roundNum, roundIdx) => {
            const matchupsList = filteredByRound[roundNum] || []
            const span = Math.pow(2, roundIdx)

            return (
              <div key={roundNum} className="flex flex-col items-center">
                <div className="text-xs font-semibold text-text-secondary mb-1">{getRoundName(roundNum)}</div>
                <div className="text-[10px] text-text-muted mb-3">{getRoundPoints(roundNum)} pts</div>
                <div
                  className="grid"
                  style={{
                    gridTemplateRows: `repeat(${firstRoundCount}, minmax(60px, 1fr))`,
                  }}
                >
                  {matchupsList.map((matchup, idx) => {
                    const resolved = resolvedMatchups?.[matchup.id]
                    const displayMatchup = resolved ? {
                      ...matchup,
                      team_top: resolved.team_top || matchup.team_top,
                      team_bottom: resolved.team_bottom || matchup.team_bottom,
                      seed_top: resolved.seed_top ?? matchup.seed_top,
                      seed_bottom: resolved.seed_bottom ?? matchup.seed_bottom,
                    } : matchup
                    return (
                      <div
                        key={matchup.id}
                        className="flex items-center"
                        style={{ gridRow: `${idx * span + 1} / span ${span}` }}
                      >
                        <MatchupCard
                          matchup={displayMatchup}
                          pick={pickMap[matchup.template_matchup_id]?.team}
                          eliminated={pickMap[matchup.template_matchup_id]?.eliminated}
                          showPick={hasPicks}
                          onTap={onMatchupTap}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        {hasPicks && (
          <div className="flex gap-4 mt-4 text-[10px] text-text-muted">
            <span><span className="inline-block w-2 h-2 bg-correct rounded-full mr-1" />Correct</span>
            <span><span className="inline-block w-2 h-2 bg-incorrect rounded-full mr-1" />Wrong</span>
            <span><span className="inline-block w-2 h-2 bg-accent rounded-full mr-1" />Your Pick</span>
            <span><span className="line-through mr-1">X</span>Eliminated</span>
          </div>
        )}
      </div>
    </div>
  )
}
