import { useState, useMemo } from 'react'
import LoadingSpinner from '../ui/LoadingSpinner'

function groupPicksByMonth(picks) {
  const groups = {}
  for (const pick of picks) {
    const date = new Date(pick.games?.starts_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!groups[key]) {
      groups[key] = { key, label, picks: [] }
    }
    groups[key].picks.push(pick)
  }
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
}

function getMonthStats(picks) {
  let wins = 0
  let losses = 0
  let net = 0
  for (const pick of picks) {
    if (pick.is_correct === true) wins++
    else if (pick.is_correct === false) losses++
    net += pick.points_earned ?? 0
  }
  return { wins, losses, net }
}

export default function PickHistoryByMonth({ picks, isLoading }) {
  const months = useMemo(() => (picks?.length ? groupPicksByMonth(picks) : []), [picks])
  const [expanded, setExpanded] = useState({})

  function isExpanded(key, index) {
    if (key in expanded) return expanded[key]
    return index === 0
  }

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !isExpanded(key, -1) }))
  }

  if (isLoading) {
    return (
      <div className="py-4">
        <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Pick History</h3>
        <LoadingSpinner />
      </div>
    )
  }

  if (!picks?.length) {
    return (
      <div className="py-4">
        <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Pick History</h3>
        <p className="text-text-muted text-sm text-center">No picks yet</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Pick History</h3>
      <div className="space-y-2">
        {months.map((month, index) => {
          const stats = getMonthStats(month.picks)
          const open = isExpanded(month.key, index)

          return (
            <div key={month.key}>
              <button
                onClick={() => toggle(month.key)}
                className="w-full bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs text-text-muted transition-transform ${open ? 'rotate-90' : ''}`}>
                    &#9656;
                  </span>
                  <span className="font-semibold text-sm">{month.label}</span>
                  <span className="text-text-muted text-xs">
                    {stats.wins}W-{stats.losses}L
                  </span>
                </div>
                <span className={`font-semibold text-sm ${
                  stats.net > 0 ? 'text-correct' : stats.net < 0 ? 'text-incorrect' : 'text-text-muted'
                }`}>
                  {stats.net > 0 ? '+' : ''}{stats.net} pts
                </span>
              </button>

              {open && (
                <div className="mt-1 space-y-1">
                  {month.picks.map((pick) => (
                    <div
                      key={pick.id}
                      className="bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {pick.games?.away_team} @ {pick.games?.home_team}
                        </div>
                        <div className="text-xs text-text-muted">
                          Picked: {pick.picked_team === 'home' ? pick.games?.home_team : pick.games?.away_team}
                        </div>
                      </div>
                      <div className={`font-semibold text-sm shrink-0 ml-3 ${
                        pick.points_earned > 0 ? 'text-correct' : pick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
                      }`}>
                        {pick.points_earned > 0 ? '+' : ''}{pick.points_earned ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
