import { useMemo, useState, useCallback, Fragment } from 'react'
import { usePickHistory } from '../hooks/usePicks'
import { useParlayHistory } from '../hooks/useParlays'
import { usePropPickHistory } from '../hooks/useProps'
import { useFuturesPickHistory } from '../hooks/useFutures'
import { usePickReactionsBatch } from '../hooks/useSocial'
import GameCard from '../components/picks/GameCard'
import ParlayCard from '../components/picks/ParlayCard'
import PropCard from '../components/picks/PropCard'
import FuturesPickCard from '../components/picks/FuturesPickCard'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

function getLocalDateKey(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateHeader(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function groupByDate(items, getDate) {
  const groups = []
  let currentKey = null
  let currentItems = []
  for (const item of items) {
    const key = getLocalDateKey(getDate(item))
    if (key !== currentKey) {
      if (currentItems.length) groups.push({ date: currentKey, items: currentItems })
      currentKey = key
      currentItems = [item]
    } else {
      currentItems.push(item)
    }
  }
  if (currentItems.length) groups.push({ date: currentKey, items: currentItems })
  return groups
}

function getTodayKey() {
  const d = new Date()
  return `results-collapsed-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadCollapsed() {
  try {
    const key = getTodayKey()
    const stored = sessionStorage.getItem(key)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export default function ResultsPage() {
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  const toggleSection = useCallback((section) => {
    setCollapsed((prev) => {
      const next = { ...prev, [section]: !prev[section] }
      sessionStorage.setItem(getTodayKey(), JSON.stringify(next))
      return next
    })
  }, [])

  const { data: picks, isLoading } = usePickHistory()
  const { data: parlays, isLoading: parlaysLoading } = useParlayHistory()
  const { data: propPicks, isLoading: propsLoading } = usePropPickHistory()
  const { data: futuresPicks, isLoading: futuresLoading } = useFuturesPickHistory()

  const { livePicks, settledPicks, liveParlays, settledParlays, liveProps, settledProps, settledFutures } = useMemo(() => {
    return {
      livePicks: (picks || []).filter(p => p.status === 'locked'),
      settledPicks: (picks || []).filter(p => p.status === 'settled'),
      liveParlays: (parlays || []).filter(p => p.status === 'locked'),
      settledParlays: (parlays || []).filter(p => p.status === 'settled'),
      liveProps: (propPicks || []).filter(p => p.status === 'locked'),
      settledProps: (propPicks || []).filter(p => p.status === 'settled'),
      settledFutures: (futuresPicks || []).filter(p => p.status === 'settled'),
    }
  }, [picks, parlays, propPicks, futuresPicks])

  const hasLive = livePicks.length > 0 || liveParlays.length > 0 || liveProps.length > 0
  const hasSettled = settledPicks.length > 0 || settledParlays.length > 0 || settledProps.length > 0 || settledFutures.length > 0

  const weeklyStats = useMemo(() => {
    if (!settledPicks.length && !settledParlays.length && !settledProps.length && !settledFutures.length) return null
    let wins = 0, losses = 0, pushes = 0, netPoints = 0
    for (const item of [...settledPicks, ...settledParlays, ...settledProps, ...settledFutures]) {
      if (item.is_correct === true) wins++
      else if (item.is_correct === false) losses++
      else pushes++
      netPoints += item.points_earned || 0
    }
    return { wins, losses, pushes, netPoints, total: settledPicks.length + settledParlays.length + settledProps.length + settledFutures.length }
  }, [settledPicks, settledParlays, settledProps, settledFutures])

  const settledPickIds = useMemo(() => {
    return settledPicks.map((p) => p.id)
  }, [settledPicks])

  const { data: reactionsBatch } = usePickReactionsBatch(settledPickIds)

  if (isLoading || parlaysLoading || propsLoading || futuresLoading) return <LoadingSpinner />

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Results</h1>

      {weeklyStats && (
        <div className="bg-bg-card rounded-2xl border border-border p-4 mb-6">
          <h2 className="font-display text-sm text-text-muted uppercase tracking-wider mb-3">Summary</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 text-center">
            <div>
              <div className="font-display text-2xl text-correct">{weeklyStats.wins}</div>
              <div className="text-xs text-text-muted">Wins</div>
            </div>
            <div>
              <div className="font-display text-2xl text-incorrect">{weeklyStats.losses}</div>
              <div className="text-xs text-text-muted">Losses</div>
            </div>
            <div>
              <div className="font-display text-2xl text-text-secondary">{weeklyStats.pushes}</div>
              <div className="text-xs text-text-muted">Pushes</div>
            </div>
            <div>
              <div className={`font-display text-2xl ${weeklyStats.netPoints >= 0 ? 'text-correct' : 'text-incorrect'}`}>
                {weeklyStats.netPoints > 0 ? '+' : ''}{weeklyStats.netPoints}
              </div>
              <div className="text-xs text-text-muted">Net Pts</div>
            </div>
          </div>
        </div>
      )}

      {hasLive && (
        <>
          <button onClick={() => toggleSection('live')} className="flex items-center justify-between w-full mb-3">
            <h2 className="font-display text-lg text-accent">Live</h2>
            <svg className={`w-5 h-5 text-text-muted transition-transform ${collapsed.live ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {!collapsed.live && (
            <div className="space-y-3 mb-6">
              {liveParlays.map((parlay) => (
                <ParlayCard key={parlay.id} parlay={parlay} />
              ))}
              {liveProps.map((pp) => (
                <PropCard key={pp.id} prop={pp.player_props} pick={pp} />
              ))}
              {livePicks.map((pick) => (
                <GameCard
                  key={pick.id}
                  game={pick.games}
                  userPick={pick}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!hasLive && !hasSettled ? (
        <EmptyState title="No results yet" message="Your settled picks will appear here" />
      ) : hasSettled && (
        <>
          {settledFutures.length > 0 && (
            <>
              <button onClick={() => toggleSection('futures')} className="flex items-center justify-between w-full mb-3">
                <h2 className="font-display text-lg text-text-secondary">Futures</h2>
                <svg className={`w-5 h-5 text-text-muted transition-transform ${collapsed.futures ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {!collapsed.futures && (
                <div className="space-y-3 mb-6">
                  {settledFutures.map((fp) => (
                    <FuturesPickCard key={fp.id} pick={fp} />
                  ))}
                </div>
              )}
            </>
          )}

          {settledParlays.length > 0 && (
            <>
              <button onClick={() => toggleSection('parlays')} className="flex items-center justify-between w-full mb-3">
                <h2 className="font-display text-lg text-text-secondary">Parlays</h2>
                <svg className={`w-5 h-5 text-text-muted transition-transform ${collapsed.parlays ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {!collapsed.parlays && (
                <div className="space-y-3 mb-6">
                  {groupByDate(settledParlays, (p) => p.created_at).map(({ date, items }) => (
                    <Fragment key={date}>
                      <p className="text-xs text-text-muted pt-1">{formatDateHeader(date)}</p>
                      {items.map((parlay) => (
                        <ParlayCard key={parlay.id} parlay={parlay} />
                      ))}
                    </Fragment>
                  ))}
                </div>
              )}
            </>
          )}

          {settledProps.length > 0 && (
            <>
              <button onClick={() => toggleSection('props')} className="flex items-center justify-between w-full mb-3">
                <h2 className="font-display text-lg text-text-secondary">Player Props</h2>
                <svg className={`w-5 h-5 text-text-muted transition-transform ${collapsed.props ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {!collapsed.props && (
                <div className="space-y-3 mb-6">
                  {groupByDate(settledProps, (p) => p.player_props?.games?.starts_at || p.created_at).map(({ date, items }) => (
                    <Fragment key={date}>
                      <p className="text-xs text-text-muted pt-1">{formatDateHeader(date)}</p>
                      {items.map((pp) => (
                        <PropCard key={pp.id} prop={pp.player_props} pick={pp} />
                      ))}
                    </Fragment>
                  ))}
                </div>
              )}
            </>
          )}

          {settledPicks.length > 0 && (
            <>
              <button onClick={() => toggleSection('picks')} className="flex items-center justify-between w-full mb-3">
                <h2 className="font-display text-lg text-text-secondary">Straight Picks</h2>
                <svg className={`w-5 h-5 text-text-muted transition-transform ${collapsed.picks ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {!collapsed.picks && (
                <div className="space-y-3">
                  {groupByDate(settledPicks, (p) => p.games.starts_at).map(({ date, items }) => (
                    <Fragment key={date}>
                      <p className="text-xs text-text-muted pt-1">{formatDateHeader(date)}</p>
                      {items.map((pick) => (
                        <GameCard
                          key={pick.id}
                          game={pick.games}
                          userPick={pick}
                          reactions={reactionsBatch?.[pick.id]}
                        />
                      ))}
                    </Fragment>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
