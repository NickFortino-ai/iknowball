import { useMemo } from 'react'

function MatchupCard({ matchup, pick, showPick }) {
  const topCorrect = pick && matchup.status === 'completed' && pick === matchup.team_top && matchup.winner === 'top'
  const bottomCorrect = pick && matchup.status === 'completed' && pick === matchup.team_bottom && matchup.winner === 'bottom'
  const topWrong = pick && matchup.status === 'completed' && pick === matchup.team_top && matchup.winner === 'bottom'
  const bottomWrong = pick && matchup.status === 'completed' && pick === matchup.team_bottom && matchup.winner === 'top'

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
    <div className="bg-bg-card border border-border rounded-lg w-44 text-xs overflow-hidden">
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
    </div>
  )
}

export default function BracketDisplay({ matchups, picks, rounds }) {
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

  const roundNumbers = Object.keys(byRound).map(Number).sort((a, b) => a - b)

  function getRoundName(roundNum) {
    const r = (rounds || []).find((r) => r.round_number === roundNum)
    return r?.name || `Round ${roundNum}`
  }

  function getRoundPoints(roundNum) {
    const r = (rounds || []).find((r) => r.round_number === roundNum)
    return r?.points_per_correct || 0
  }

  const hasPicks = picks && picks.length > 0

  // Desktop horizontal view
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-max py-2">
        {roundNumbers.map((roundNum) => (
          <div key={roundNum} className="flex flex-col items-center">
            <div className="text-xs font-semibold text-text-secondary mb-1">{getRoundName(roundNum)}</div>
            <div className="text-[10px] text-text-muted mb-3">{getRoundPoints(roundNum)} pts</div>
            <div
              className="flex flex-col gap-3 justify-around"
              style={{ minHeight: byRound[roundNumbers[0]]?.length * 60 || 200 }}
            >
              {byRound[roundNum]?.map((matchup) => (
                <MatchupCard
                  key={matchup.id}
                  matchup={matchup}
                  pick={pickMap[matchup.template_matchup_id]}
                  showPick={hasPicks}
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
  )
}
