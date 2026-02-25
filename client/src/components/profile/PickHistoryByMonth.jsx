import { useState, useMemo, useEffect, Fragment } from 'react'
import LoadingSpinner from '../ui/LoadingSpinner'

function normalizeItems(picks, parlays, propPicks, futuresPicks, bonuses) {
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

  for (const bonus of (bonuses || [])) {
    items.push({
      id: bonus.id,
      type: 'bonus',
      label: bonus.label,
      detail: '',
      date: bonus.created_at,
      is_correct: true,
      points_earned: bonus.points,
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

const TYPE_ORDER = ['live', 'pick', 'parlay', 'prop', 'futures', 'bonus']
const TYPE_LABELS = { live: 'Live', pick: 'Picks', parlay: 'Parlays', prop: 'Props', futures: 'Futures', bonus: 'Bonuses' }

function groupByType(items) {
  const now = new Date()
  const groups = {}
  for (const item of items) {
    // Unsettled picks/parlays/props whose game hasn't started yet — hide them
    if (item.is_correct === null && item.type !== 'bonus' && item.type !== 'futures' && new Date(item.date) > now) {
      continue
    }
    const key = item.is_correct === null && item.type !== 'bonus' && item.type !== 'futures' ? 'live' : item.type
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return TYPE_ORDER.filter((t) => groups[t]?.length).map((t) => ({ type: t, label: TYPE_LABELS[t], items: groups[t] }))
}

function getLocalDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function useTodayKey() {
  const [key, setKey] = useState(getLocalDateKey)
  useEffect(() => {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const ms = tomorrow - now + 100
    const timer = setTimeout(() => setKey(getLocalDateKey()), ms)
    return () => clearTimeout(timer)
  }, [key])
  return key
}

export default function PickHistoryByMonth({ picks, parlays, propPicks, futuresPicks, bonuses, isLoading, allCollapsed, onItemTap }) {
  const todayKey = useTodayKey()

  const { todayItems, months } = useMemo(() => {
    const items = normalizeItems(picks, parlays, propPicks, futuresPicks, bonuses)
    const today = []
    const older = []
    for (const item of items) {
      const d = new Date(item.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (key === todayKey) {
        today.push(item)
      } else {
        older.push(item)
      }
    }
    today.sort((a, b) => TYPE_ORDER.indexOf(a.type === 'bonus' ? 'bonus' : a.type) - TYPE_ORDER.indexOf(b.type === 'bonus' ? 'bonus' : b.type))
    return {
      todayItems: today,
      months: older.length ? groupByMonth(older) : [],
    }
  }, [picks, parlays, propPicks, futuresPicks, bonuses, todayKey])

  const hasTodayAction = todayItems.length > 0
  const [expanded, setExpanded] = useState({})
  const [collapsedTypes, setCollapsedTypes] = useState({})

  function isExpanded(key, index) {
    if (key in expanded) return expanded[key]
    if (hasTodayAction) return false
    return allCollapsed ? false : index === 0
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

  if (!months.length && !hasTodayAction) {
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
        {hasTodayAction && (() => {
          const todayStats = getMonthStats(todayItems)
          const todayOpen = expanded['today'] !== false
          return (
            <div>
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, today: !(prev.today !== false) }))}
                className="w-full bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs text-accent transition-transform ${todayOpen ? 'rotate-90' : ''}`}>
                    &#9656;
                  </span>
                  <span className="font-semibold text-sm text-accent">Today's Action</span>
                  <span className="text-text-muted text-xs">
                    {todayStats.wins}W-{todayStats.losses}L
                  </span>
                </div>
                <span className={`font-semibold text-sm ${
                  todayStats.net > 0 ? 'text-correct' : todayStats.net < 0 ? 'text-incorrect' : 'text-text-muted'
                }`}>
                  {todayStats.net > 0 ? '+' : ''}{todayStats.net} pts
                </span>
              </button>
              {todayOpen && (
                <div className="mt-1 space-y-1">
                  {todayItems.map((item) => {
                    const isTappable = onItemTap && (item.type === 'pick' || item.type === 'parlay' || item.type === 'prop')
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        className={`bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between${isTappable ? ' cursor-pointer hover:bg-bg-card-hover active:bg-bg-card-hover transition-colors' : ''}`}
                        onClick={isTappable ? () => onItemTap(item.type, item.id) : undefined}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{item.label}</div>
                          <div className="text-xs text-text-muted truncate">{item.detail}</div>
                        </div>
                        <div className={`font-semibold text-sm shrink-0 ml-3 ${
                          item.points_earned > 0 ? 'text-correct' : item.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
                        }`}>
                          {item.points_earned > 0 ? '+' : ''}{item.points_earned ?? 0}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
        {months.map((month, index) => {
          const stats = getMonthStats(month.items)
          const open = isExpanded(month.key, index)
          const today = new Date()
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

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
                <div className="mt-1 space-y-2">
                  {groupByType(month.items).map((group) => {
                    const typeKey = `${month.key}-${group.type}`
                    const typeOpen = collapsedTypes[typeKey] !== false
                    const typeStats = getMonthStats(group.items)
                    return (
                      <div key={typeKey}>
                        <button
                          onClick={() => setCollapsedTypes((prev) => ({ ...prev, [typeKey]: !typeOpen }))}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
                        >
                          <span className={`text-xs text-text-muted transition-transform ${typeOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{group.label}</span>
                          <span className="text-xs text-text-muted">{typeStats.wins}W-{typeStats.losses}L</span>
                          {!typeOpen && (
                            <span className={`text-xs font-semibold ml-auto ${typeStats.net > 0 ? 'text-correct' : typeStats.net < 0 ? 'text-incorrect' : 'text-text-muted'}`}>
                              {typeStats.net > 0 ? '+' : ''}{typeStats.net}
                            </span>
                          )}
                        </button>
                        {typeOpen && (
                          <div className="space-y-1">
                            {group.items.map((item, itemIdx) => {
                              const isTappable = onItemTap && (item.type === 'pick' || item.type === 'parlay' || item.type === 'prop')
                              const itemDate = new Date(item.date)
                              const itemStr = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}-${String(itemDate.getDate()).padStart(2, '0')}`
                              const isToday = itemStr === todayStr
                              const prevItem = group.items[itemIdx - 1]
                              const prevDate = prevItem ? new Date(prevItem.date) : null
                              const prevIsToday = prevDate ? `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}` === todayStr : false
                              const showDivider = !isToday && prevIsToday
                              return (
                                <Fragment key={`${item.type}-${item.id}`}>
                                  {showDivider && <hr className="border-t border-white/15 my-1" />}
                                  <div
                                    className={`bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between${isTappable ? ' cursor-pointer hover:bg-bg-card-hover active:bg-bg-card-hover transition-colors' : ''}`}
                                    onClick={isTappable ? () => onItemTap(item.type, item.id) : undefined}
                                  >
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold truncate">{item.label}</div>
                                      <div className="text-xs text-text-muted truncate">{item.detail}</div>
                                    </div>
                                    {item.type === 'futures' && item.is_correct === null ? (
                                      <span className="text-xs font-medium text-text-muted bg-white/5 px-2 py-0.5 rounded ml-3">Pending</span>
                                    ) : (
                                      <div className={`font-semibold text-sm shrink-0 ml-3 ${
                                        item.points_earned > 0 ? 'text-correct' : item.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
                                      }`}>
                                        {item.points_earned > 0 ? '+' : ''}{item.points_earned ?? 0}
                                      </div>
                                    )}
                                  </div>
                                </Fragment>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
