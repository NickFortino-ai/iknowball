import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useGames, useActiveSports } from '../hooks/useGames'
import { useMyPicks, useSubmitPick, useDeletePick, useUpdatePickMultiplier } from '../hooks/usePicks'
import { useSharePickToSquad } from '../hooks/useConnections'
import { useMyParlays, useDeleteParlay } from '../hooks/useParlays'
import { usePickStore } from '../stores/pickStore'
import GameCard from '../components/picks/GameCard'
import BottomBar from '../components/picks/BottomBar'
import ParlaySlip from '../components/picks/ParlaySlip'
import ParlayCard from '../components/picks/ParlayCard'
import FeaturedPropSection from '../components/picks/FeaturedPropSection'
import FuturesSection from '../components/picks/FuturesSection'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { toast } from '../components/ui/Toast'
import InfoTooltip from '../components/ui/InfoTooltip'
import { triggerHaptic } from '../lib/haptics'
import { useAuthStore } from '../stores/authStore'

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NHL', key: 'icehockey_nhl' },
  { label: 'MLS', key: 'soccer_usa_mls' },
  { label: 'WNBA', key: 'basketball_wnba' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

function getDateOffset(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d
}

function formatDateLabel(offset) {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return getDateOffset(offset).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

export default function PicksPage() {
  const [activeSport, setActiveSport] = useState(null)
  const [dayOffset, setDayOffset] = useState(0)
  const [isFuturesMode, setIsFuturesMode] = useState(false)
  const userChangedDay = useRef(false)

  const { data: activeSportsData } = useActiveSports()

  const activeKeys = useMemo(() => {
    if (!activeSportsData) return new Set()
    return new Set(activeSportsData.map((s) => s.key))
  }, [activeSportsData])

  const sortedTabs = useMemo(() => {
    return [...sportTabs].sort((a, b) => {
      const aActive = activeKeys.has(a.key) ? 0 : 1
      const bActive = activeKeys.has(b.key) ? 0 : 1
      return aActive - bActive
    })
  }, [activeKeys])

  useEffect(() => {
    if (activeSport !== null) return
    if (!activeSportsData) return
    const firstActive = sortedTabs.find((t) => activeKeys.has(t.key))
    setActiveSport(firstActive ? firstActive.key : sortedTabs[0].key)
  }, [activeSportsData, sortedTabs, activeKeys, activeSport])

  const sportKey = activeSport || sortedTabs[0].key

  const { data: games, isLoading: gamesLoading } = useGames(sportKey, 'upcoming')
  const { data: myPicks, isLoading: picksLoading } = useMyPicks()
  const submitPick = useSubmitPick()
  const deletePick = useDeletePick()
  const sharePick = useSharePickToSquad()
  const updateMultiplier = useUpdatePickMultiplier()
  const profile = useAuthStore((s) => s.profile)
  const [sharedPickIds, setSharedPickIds] = useState(new Set())

  const { data: activeParlays } = useMyParlays('pending')
  const { data: lockedParlays } = useMyParlays('locked')
  const deleteParlay = useDeleteParlay()

  const parlayMode = usePickStore((s) => s.parlayMode)
  const setParlayMode = usePickStore((s) => s.setParlayMode)
  const parlayLegs = usePickStore((s) => s.parlayLegs)
  const addParlayLeg = usePickStore((s) => s.addParlayLeg)
  const removeParlayLeg = usePickStore((s) => s.removeParlayLeg)
  const updateParlayLeg = usePickStore((s) => s.updateParlayLeg)

  const picksMap = useMemo(() => {
    if (!myPicks) return {}
    const map = {}
    for (const pick of myPicks) {
      map[pick.game_id] = pick
    }
    return map
  }, [myPicks])

  const pendingPicksMap = useMemo(() => {
    if (!myPicks) return {}
    const map = {}
    for (const pick of myPicks) {
      if (pick.status === 'pending') {
        map[pick.game_id] = pick
      }
    }
    return map
  }, [myPicks])

  const selectedDate = getDateOffset(dayOffset)

  const filteredGames = useMemo(() => {
    if (!games) return []
    return games.filter((game) => isSameDay(new Date(game.starts_at), selectedDate))
  }, [games, selectedDate])

  useEffect(() => {
    userChangedDay.current = false
    setDayOffset(0)
  }, [activeSport])

  useEffect(() => {
    if (userChangedDay.current) return
    if (!games || gamesLoading) return
    for (let d = dayOffset; d <= 2; d++) {
      const dayGames = games.filter((game) => isSameDay(new Date(game.starts_at), getDateOffset(d)))
      if (dayGames.length > 0) {
        if (d !== dayOffset) setDayOffset(d)
        return
      }
    }
  }, [games, gamesLoading, dayOffset])

  async function handlePick(gameId, team) {
    try {
      await submitPick.mutateAsync({ gameId, pickedTeam: team })
      triggerHaptic('Light')
      toast('Pick submitted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  async function handleUndoPick(gameId) {
    try {
      await deletePick.mutateAsync(gameId)
      toast('Pick removed', 'info')
    } catch (err) {
      toast(err.message || 'Failed to undo pick', 'error')
    }
  }

  const handleShare = useCallback(async (pickId) => {
    try {
      await sharePick.mutateAsync(pickId)
      setSharedPickIds((prev) => new Set([...prev, pickId]))
      toast('Shared to squad!', 'success')
    } catch (err) {
      if (err.message?.includes('already shared')) {
        setSharedPickIds((prev) => new Set([...prev, pickId]))
      }
      toast(err.message || 'Failed to share', 'error')
    }
  }, [sharePick])

  const parlayLegsMap = useMemo(() => {
    const map = {}
    for (const leg of parlayLegs) {
      map[leg.gameId] = leg.pickedTeam
    }
    return map
  }, [parlayLegs])

  async function handleDeleteParlay(parlayId) {
    try {
      await deleteParlay.mutateAsync(parlayId)
      toast('Parlay deleted', 'info')
    } catch (err) {
      toast(err.message || 'Failed to delete parlay', 'error')
    }
  }

  async function handleUpdateMultiplier(gameId, multiplier) {
    try {
      await updateMultiplier.mutateAsync({ gameId, multiplier })
      triggerHaptic('Light')
    } catch (err) {
      toast(err.message || 'Failed to update multiplier', 'error')
    }
  }

  function handleParlayToggle(gameId, side, game) {
    const existing = parlayLegsMap[gameId]
    if (existing === side) {
      removeParlayLeg(gameId)
    } else if (existing) {
      updateParlayLeg(gameId, side)
    } else {
      addParlayLeg(gameId, side, game)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
      <h1 className="font-display text-3xl mb-6">
        Make Your Picks
        <InfoTooltip text="Risk → Reward: You risk the red number on every pick. If you're right, you win the green number. If you're wrong, you lose the red number. Higher odds = higher reward but less likely to hit. Example: -10 → +19 means you risk 10 points to win 19 points." />
      </h1>

      {/* Straight / Parlay toggle */}
      {!isFuturesMode && (
        <div className="flex bg-bg-card rounded-xl border border-border p-1 mb-4">
          {['Straight', 'Parlay'].map((mode) => {
            const isActive = mode === 'Parlay' ? parlayMode : !parlayMode
            return (
              <button
                key={mode}
                onClick={() => setParlayMode(mode === 'Parlay')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isActive ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-card-hover'
                }`}
              >
                {mode}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex overflow-x-auto gap-2 pb-2 mb-4 scrollbar-hide -mx-4 px-4">
        {sortedTabs.map((tab) => {
          const isActive = activeSport === tab.key && !isFuturesMode
          const hasGames = activeKeys.has(tab.key)
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveSport(tab.key); setIsFuturesMode(false) }}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-accent text-white'
                  : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
              }${!hasGames && !isActive ? ' opacity-50' : ''}`}
            >
              {tab.label}
            </button>
          )
        })}
        <button
          onClick={() => setIsFuturesMode(true)}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            isFuturesMode
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Futures
        </button>
      </div>

      {isFuturesMode ? (
        <FuturesSection />
      ) : (
        <>
          {/* Day Navigation */}
          <div className="flex items-center justify-between bg-bg-card rounded-xl border border-border px-4 py-3 mb-6">
            <button
              onClick={() => { userChangedDay.current = true; setDayOffset((d) => Math.max(0, d - 1)) }}
              disabled={dayOffset === 0}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-lg font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary hover:bg-bg-card-hover"
            >
              ‹
            </button>
            <div className="text-center">
              <div className="font-display text-lg">{formatDateLabel(dayOffset)}</div>
              <div className="text-text-muted text-xs">
                {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
            <button
              onClick={() => { userChangedDay.current = true; setDayOffset((d) => Math.min(2, d + 1)) }}
              disabled={dayOffset === 2}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-lg font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary hover:bg-bg-card-hover"
            >
              ›
            </button>
          </div>

          {/* Daily Featured Player Prop */}
          {!parlayMode && <FeaturedPropSection date={selectedDate} sportKey={sportKey} />}

          {/* My Parlays (visible in parlay mode) */}
          {parlayMode && (activeParlays?.length > 0 || lockedParlays?.length > 0) && (
            <div className="mb-6">
              <h2 className="font-display text-lg text-text-secondary mb-3">My Parlays</h2>
              <div className="space-y-3">
                {(lockedParlays || []).map((p) => (
                  <ParlayCard key={p.id} parlay={p} />
                ))}
                {(activeParlays || []).map((p) => (
                  <ParlayCard key={p.id} parlay={p} onDelete={handleDeleteParlay} />
                ))}
              </div>
            </div>
          )}

          {/* Game Cards */}
          {gamesLoading || picksLoading ? (
            <LoadingSpinner />
          ) : filteredGames.length === 0 ? (
            <EmptyState title="No games" message={`No upcoming games on ${formatDateLabel(dayOffset).toLowerCase()}`} />
          ) : (
            <div className="space-y-3">
              {filteredGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  userPick={picksMap[game.id]}
                  onPick={handlePick}
                  onUndoPick={handleUndoPick}
                  isSubmitting={submitPick.isPending || deletePick.isPending}
                  onShare={handleShare}
                  isShared={sharedPickIds.has(picksMap[game.id]?.id)}
                  parlayMode={parlayMode}
                  parlayPickedTeam={parlayLegsMap[game.id] || null}
                  onParlayToggle={handleParlayToggle}
                />
              ))}
            </div>
          )}

          {parlayMode ? <ParlaySlip /> : <BottomBar picks={pendingPicksMap} games={games} profile={profile} onUpdateMultiplier={handleUpdateMultiplier} />}
        </>
      )}
    </div>
  )
}
