import { useMemo, useState } from 'react'

function MatchupCard({ matchup, pick, showPick, onTap }) {
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
      map[p.template_matchup_id] = p.picked_team
    }
    return map
  }, [picks])

  // Group matchups by round
  const byRound = useMemo(() => {
    const grouped = {}
    for (const m of matchups || []) {
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
          {roundNumbers.map((roundNum) => (
            <div key={roundNum} className="flex flex-col items-center">
              <div className="text-xs font-semibold text-text-secondary mb-1">{getRoundName(roundNum)}</div>
              <div className="text-[10px] text-text-muted mb-3">{getRoundPoints(roundNum)} pts</div>
              <div
                className="flex flex-col gap-3 justify-around"
                style={{ minHeight: firstRoundCount * 60 || 200 }}
              >
                {filteredByRound[roundNum]?.map((matchup) => (
                  <MatchupCard
                    key={matchup.id}
                    matchup={matchup}
                    pick={pickMap[matchup.template_matchup_id]}
                    showPick={hasPicks}
                    onTap={onMatchupTap}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        {hasPicks && (
          <div className="flex gap-4 mt-4 text-[10px] text-text-muted">
            <span><span className="inline-block w-2 h-2 bg-correct rounded-full mr-1" />Correct</span>
            <span><span className="inline-block w-2 h-2 bg-incorrect rounded-full mr-1" />Wrong</span>
            <span><span className="inline-block w-2 h-2 bg-accent rounded-full mr-1" />Your Pick</span>
          </div>
        )}
      </div>
    </div>
  )
}
