import { useMemo } from 'react'
import { useMyLeagueWins } from '../../hooks/useLeagues'

function getTrophySize(memberCount) {
  if (memberCount >= 100) return 'text-5xl'
  if (memberCount >= 50) return 'text-4xl'
  if (memberCount >= 25) return 'text-3xl'
  if (memberCount >= 10) return 'text-2xl'
  return 'text-xl'
}

export default function TrophyCase() {
  const { data: wins } = useMyLeagueWins()

  const sorted = useMemo(() => {
    if (!wins?.length) return []
    return [...wins].sort((a, b) => b.member_count - a.member_count)
  }, [wins])

  if (!sorted.length) return null

  return (
    <div className="mt-6 mb-6">
      <h2 className="font-display text-xl text-center mb-4">Trophy Case</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sorted.map((win) => (
          <div
            key={win.id}
            className="bg-bg-card rounded-xl p-4 flex flex-col items-center text-center border border-border"
          >
            <span className={getTrophySize(win.member_count)}>🏆</span>
            <p className="text-sm font-semibold mt-2 text-text-primary leading-tight">
              {win.league_name}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Outlasted {win.member_count - 1} player{win.member_count - 1 !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
