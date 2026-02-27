import { useMemo, useState, useCallback, useEffect, Fragment } from 'react'
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
import GamePicksModal from '../components/results/GamePicksModal'

function getParlayGameDate(parlay) {
  const starts = (parlay.parlay_legs || [])
    .map((l) => l.games?.starts_at)
    .filter(Boolean)
    .sort()
  return starts[0] || parlay.created_at
}

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

function getSessionKey() {
  const d = new Date()
  return `results-collapsed-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function useTodayKey() {
  const [key, setKey] = useState(() => getLocalDateKey(new Date().toISOString()))
  useEffect(() => {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const ms = tomorrow - now + 100
    const timer = setTimeout(() => setKey(getLocalDateKey(new Date().toISOString())), ms)
    return () => clearTimeout(timer)
  }, [key])
  return key
}

function loadCollapsed() {
  try {
    const key = getSessionKey()
    const stored = sessionStorage.getItem(key)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export default function ResultsPage() {
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [selectedGame, setSelectedGame] = useState(null)
  const [selectedPick, setSelectedPick] = useState(null)

  const toggleSection = useCallback((section, defaultCollapsed) => {
    setCollapsed((prev) => {
      const current = prev[section] !== undefined ? prev[section] : !!defaultCollapsed
      const next = { ...prev, [section]: !current }
      sessionStorage.setItem(getSessionKey(), JSON.stringify(next))
      return next
    })
  }, [])

  const { data: picks, isLoading } = usePickHistory()
  const { data: parlays, isLoading: parlaysLoading } = useParlayHistory()
  const { data: propPicks, isLoading: propsLoading } = usePropPickHistory()
  const { data: futuresPicks, isLoading: futuresLoading } = useFuturesPickHistory()

  const todayKey = useTodayKey()

  const { todayPicks, todayParlays, todayProps, olderSettledPicks, olderSettledParlays, olderSettledProps, settledFutures } = useMemo(() => {
    const allPicks = (picks || []).filter(p => p.status === 'locked' || p.status === 'settled')
    const allParlays = (parlays || []).filter(p => p.status === 'locked' || p.status === 'settled')
    const allProps = (propPicks || []).filter(p => p.status === 'locked' || p.status === 'settled')

    return {
      todayPicks: allPicks.filter(p => getLocalDateKey(p.games?.starts_at) === todayKey),
      todayParlays: allParlays.filter(p => getLocalDateKey(getParlayGameDate(p)) === todayKey),
      todayProps: allProps.filter(p => getLocalDateKey(p.player_props?.games?.starts_at || p.created_at) === todayKey),
      olderSettledPicks: allPicks.filter(p => p.status === 'settled' && getLocalDateKey(p.games?.starts_at) !== todayKey),
      olderSettledParlays: allParlays.filter(p => p.status === 'settled' && getLocalDateKey(getParlayGameDate(p)) !== todayKey),
      olderSettledProps: allProps.filter(p => p.status === 'settled' && getLocalDateKey(p.player_props?.games?.starts_at || p.created_at) !== todayKey),
      settledFutures: (futuresPicks || []).filter(p => p.status === 'settled'),
    }
  }, [picks, parlays, propPicks, futuresPicks, todayKey])

  const hasTodayAction = todayPicks.length > 0 || todayParlays.length > 0 || todayProps.length > 0
  const hasSettled = olderSettledPicks.length > 0 || olderSettledParlays.length > 0 || olderSettledProps.length > 0 || settledFutures.length > 0

  const allSettledPicks = useMemo(() => [...todayPicks.filter(p => p.status === 'settled'), ...olderSettledPicks], [todayPicks, olderSettledPicks])
  const allSettledParlays = useMemo(() => [...todayParlays.filter(p => p.status === 'settled'), ...olderSettledParlays], [todayParlays, olderSettledParlays])
  const allSettledProps = useMemo(() => [...todayProps.filter(p => p.status === 'settled'), ...olderSettledProps], [todayProps, olderSettledProps])

  const weeklyStats = useMemo(() => {
    if (!allSettledPicks.length && !allSettledParlays.length && !allSettledProps.length && !settledFutures.length) return null
    let wins = 0, losses = 0, pushes = 0, netPoints = 0
    for (const item of [...allSettledPicks, ...allSettledParlays, ...allSettledProps, ...settledFutures]) {
      if (item.is_correct === true) wins++
      else if (item.is_correct === false) losses++
      else pushes++
      netPoints += item.points_earned || 0
    }
    return { wins, losses, pushes, netPoints, total: allSettledPicks.length + allSettledParlays.length + allSettledProps.length + settledFutures.length }
  }, [allSettledPicks, allSettledParlays, allSettledProps, settledFutures])

  const settledPickIds = useMemo(() => {
    return allSettledPicks.map((p) => p.id)
  }, [allSettledPicks])

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

      {hasTodayAction && (
        <>
          <button onClick={() => toggleSection('today')} className="flex items-center justify-between w-full mb-3">
            <h2 className="font-display text-lg text-accent">Today's Action</h2>
            <svg className={`w-5 h-5 text-text-muted transition-transform ${collapsed.today ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {!collapsed.today && (
            <div className="space-y-3 mb-6">
              {todayPicks.map((pick) => (
                <GameCard
                  key={pick.id}
                  game={pick.games}
                  userPick={pick}
                  reactions={reactionsBatch?.[pick.id]}
                  onCardClick={() => { setSelectedGame(pick.games); setSelectedPick(pick) }}
                />
              ))}
              {todayParlays.map((parlay) => (
                <ParlayCard key={parlay.id} parlay={parlay} />
              ))}
              {todayProps.map((pp) => (
                <PropCard key={pp.id} prop={pp.player_props} pick={pp} />
              ))}
            </div>
          )}
        </>
      )}

      {!hasTodayAction && !hasSettled ? (
        <EmptyState title="No results yet" message="Your settled picks will appear here" />
      ) : hasSettled && (
        <>
          {settledFutures.length > 0 && (() => {
            const isCollapsed = collapsed.futures !== undefined ? collapsed.futures : hasTodayAction
            return (
              <>
                <button onClick={() => toggleSection('futures', hasTodayAction)} className="flex items-center justify-between w-full mb-3">
                  <h2 className="font-display text-lg text-text-secondary">Futures</h2>
                  <svg className={`w-5 h-5 text-text-muted transition-transform ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {!isCollapsed && (
                  <div className="space-y-3 mb-6">
                    {settledFutures.map((fp) => (
                      <FuturesPickCard key={fp.id} pick={fp} />
                    ))}
                  </div>
                )}
              </>
            )
          })()}

          {olderSettledPicks.length > 0 && (() => {
            const isCollapsed = collapsed.picks !== undefined ? collapsed.picks : hasTodayAction
            return (
              <>
                <button onClick={() => toggleSection('picks', hasTodayAction)} className="flex items-center justify-between w-full mb-3">
                  <h2 className="font-display text-lg text-text-secondary">Straight Picks</h2>
                  <svg className={`w-5 h-5 text-text-muted transition-transform ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {!isCollapsed && (
                  <div className="space-y-3 mb-6">
                    {groupByDate(olderSettledPicks, (p) => p.games.starts_at).map(({ date, items }) => (
                      <Fragment key={date}>
                        <p className="text-xs text-text-muted pt-1">{formatDateHeader(date)}</p>
                        {items.map((pick) => (
                          <GameCard
                            key={pick.id}
                            game={pick.games}
                            userPick={pick}
                            reactions={reactionsBatch?.[pick.id]}
                            onCardClick={() => { setSelectedGame(pick.games); setSelectedPick(pick) }}
                          />
                        ))}
                      </Fragment>
                    ))}
                  </div>
                )}
              </>
            )
          })()}

          {olderSettledParlays.length > 0 && (() => {
            const isCollapsed = collapsed.parlays !== undefined ? collapsed.parlays : hasTodayAction
            return (
              <>
                <button onClick={() => toggleSection('parlays', hasTodayAction)} className="flex items-center justify-between w-full mb-3">
                  <h2 className="font-display text-lg text-text-secondary">Parlays</h2>
                  <svg className={`w-5 h-5 text-text-muted transition-transform ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {!isCollapsed && (
                  <div className="space-y-3 mb-6">
                    {groupByDate(olderSettledParlays, (p) => p.created_at).map(({ date, items }) => (
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
            )
          })()}

          {olderSettledProps.length > 0 && (() => {
            const isCollapsed = collapsed.props !== undefined ? collapsed.props : hasTodayAction
            return (
              <>
                <button onClick={() => toggleSection('props', hasTodayAction)} className="flex items-center justify-between w-full mb-3">
                  <h2 className="font-display text-lg text-text-secondary">Player Props</h2>
                  <svg className={`w-5 h-5 text-text-muted transition-transform ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {!isCollapsed && (
                  <div className="space-y-3">
                    {groupByDate(olderSettledProps, (p) => p.player_props?.games?.starts_at || p.created_at).map(({ date, items }) => (
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
            )
          })()}
        </>
      )}
      <GamePicksModal game={selectedGame} userPick={selectedPick} onClose={() => { setSelectedGame(null); setSelectedPick(null) }} />
    </div>
  )
}
