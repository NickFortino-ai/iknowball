import { useState, useMemo } from 'react'
import LoadingSpinner from '../ui/LoadingSpinner'

function normalizeItems(picks, parlays, propPicks, futuresPicks) {
  const items = []

  for (const pick of (picks || [])) {
    items.push({
      id: pick.id,
      type: 'pick',
      label: `${pick.games?.away_team} @ ${pick.games?.home_team}`,
      detail: `Picked: ${pick.picked_team === 'home' ? pick.games?.home_team : pick.games?.away_team}`,
      date: pick.games?.starts_at,
      is_correct: pick.is_correct,
      points_earned: pick.points_earned,
    })
  }

  for (const parlay of (parlays || [])) {
    const legs = parlay.parlay_legs || []
    const legSummary = legs.map((l) => {
      const team = l.picked_team === 'home' ? l.games?.home_team : l.games?.away_team
      return team
    }).join(', ')
    items.push({
      id: parlay.id,
      type: 'parlay',
      label: `${parlay.leg_count}-Leg Parlay`,
      detail: legSummary,
      date: parlay.updated_at,
      is_correct: parlay.is_correct,
      points_earned: parlay.points_earned,
    })
  }

  for (const pp of (propPicks || [])) {
    items.push({
      id: pp.id,
      type: 'prop',
      label: `${pp.player_props?.player_name} — ${pp.player_props?.line} ${pp.player_props?.market_label}`,
      detail: `Picked: ${pp.picked_side}`,
      date: pp.player_props?.games?.starts_at || pp.updated_at,
      is_correct: pp.is_correct,
      points_earned: pp.points_earned,
    })
  }

  for (const fp of (futuresPicks || [])) {
    items.push({
      id: fp.id,
      type: 'futures',
      label: fp.futures_markets?.title || 'Futures',
      detail: `Picked: ${fp.picked_outcome}`,
      date: fp.updated_at,
      is_correct: fp.is_correct,
      points_earned: fp.points_earned,
    })
  }

  return items
}

function groupByMonth(items) {
  const groups = {}
  for (const item of items) {
    const date = new Date(item.date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!groups[key]) {
      groups[key] = { key, label, items: [] }
    }
    groups[key].items.push(item)
  }
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
}

function getMonthStats(items) {
  let wins = 0
  let losses = 0
  let net = 0
  for (const item of items) {
    if (item.is_correct === true) wins++
    else if (item.is_correct === false) losses++
    net += item.points_earned ?? 0
  }
  return { wins, losses, net }
}

export default function PickHistoryByMonth({ picks, parlays, propPicks, futuresPicks, isLoading }) {
  const months = useMemo(() => {
    const items = normalizeItems(picks, parlays, propPicks, futuresPicks)
    return items.length ? groupByMonth(items) : []
  }, [picks, parlays, propPicks, futuresPicks])
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

  if (!months.length) {
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
          const stats = getMonthStats(month.items)
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
                  {month.items.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {item.type !== 'pick' && (
                            <span className="text-xs text-text-muted font-normal mr-1.5">
                              {item.type === 'parlay' ? 'Parlay' : item.type === 'futures' ? 'Futures' : 'Prop'}
                            </span>
                          )}
                          {item.label}
                        </div>
                        <div className="text-xs text-text-muted truncate">
                          {item.detail}
                        </div>
                      </div>
                      <div className={`font-semibold text-sm shrink-0 ml-3 ${
                        item.points_earned > 0 ? 'text-correct' : item.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
                      }`}>
                        {item.points_earned > 0 ? '+' : ''}{item.points_earned ?? 0}
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
