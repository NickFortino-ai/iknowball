import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGames, useActiveSports } from '../hooks/useGames'
import { useMyPicks, useSubmitPick, useDeletePick, useUpdatePickMultiplier } from '../hooks/usePicks'
import { useMyParlays, useDeleteParlay } from '../hooks/useParlays'
import { useMyPropPicks } from '../hooks/useProps'
import { usePickStore } from '../stores/pickStore'
import GameCard from '../components/picks/GameCard'
import { getNcaafMatchupScore } from '../lib/ncaafPrestige'
import BottomBar from '../components/picks/BottomBar'
import ParlaySlip from '../components/picks/ParlaySlip'
import ParlayCard from '../components/picks/ParlayCard'
import FeaturedPropSection from '../components/picks/FeaturedPropSection'
import FuturesSection from '../components/picks/FuturesSection'
import PropsSection from '../components/picks/PropsSection'
import GameIntelModal from '../components/picks/GameIntelModal'
import { GAME_INTEL_SPORTS } from '../lib/gameIntelSports'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { toast } from '../components/ui/Toast'
import InfoTooltip from '../components/ui/InfoTooltip'
import { triggerHaptic } from '../lib/haptics'
import { useAuthStore } from '../stores/authStore'

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'WNCAAB', key: 'basketball_wncaab' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'UFL', key: 'americanfootball_ufl' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NHL', key: 'icehockey_nhl' },
  { label: 'MLS', key: 'soccer_usa_mls' },
  { label: 'WC', key: 'soccer_world_cup' },
  { label: 'WNBA', key: 'basketball_wnba' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

const INTEL_SPORTS = new Set(['basketball_nba', 'basketball_wnba', 'americanfootball_nfl', 'icehockey_nhl'])

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
  // ?tab=props opens the Props tab directly.
  //
  // Which tab you are on is React state, not a route, so nothing could link
  // to it — the onboarding tutorial's props step could spotlight the tab but
  // not open it, and the player read a paragraph about moving the line while
  // looking at the straight-pick board. Mirrors the ?tab= param HubPage
  // already accepts for the arcade.
  const [searchParams] = useSearchParams()
  const [isFuturesMode, setIsFuturesMode] = useState(() => searchParams.get('tab') === 'futures')
  const [isPropsMode, setIsPropsMode] = useState(() => searchParams.get('tab') === 'props')

  // Re-reads on change, so arriving from a page that is already /picks still
  // switches — the tutorial navigates /picks -> /picks?tab=props, same path.
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'props') { setIsPropsMode(true); setIsFuturesMode(false) }
    else if (tab === 'futures') { setIsFuturesMode(true); setIsPropsMode(false) }
  }, [searchParams])
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
  const { data: allGames } = useGames(null, 'upcoming')
  const { data: myPicks, isLoading: picksLoading } = useMyPicks()
  const submitPick = useSubmitPick()
  const deletePick = useDeletePick()
  const updateMultiplier = useUpdatePickMultiplier()
  const profile = useAuthStore((s) => s.profile)
  const [injuryGameId, setInjuryGameId] = useState(null)

  const { data: pendingPropPicks } = useMyPropPicks('pending')
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
    const dayGames = games.filter((game) => isSameDay(new Date(game.starts_at), selectedDate))
    // NCAAF: re-order so marquee matchups float to the top of each day.
    // Combined AP Top 25 rank (lower = better), prestige tier as
    // tiebreaker. Kickoff time is the final tiebreak.
    if (activeSport === 'americanfootball_ncaaf') {
      return [...dayGames].sort((a, b) => {
        const s = getNcaafMatchupScore(a) - getNcaafMatchupScore(b)
        if (s !== 0) return s
        return new Date(a.starts_at) - new Date(b.starts_at)
      })
    }
    return dayGames
  }, [games, selectedDate, activeSport])

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
    // Block parlay legs on games where both sides have positive odds
    if (game.home_odds > 0 && game.away_odds > 0) {
      toast('This game can\'t be added to a parlay — both sides have positive odds, which would allow guaranteed profit. You can still make a straight pick.', 'error')
      return
    }
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

      {/* Straight / Parlay / Props — WHAT KIND OF BET, which is a different
          question from which sport.

          Props used to sit in the sport row below, beside NFL and NBA, and
          selecting it hid this control outright. So the two rows fought:
          choosing a "sport" silently threw away the bet type. Props is a
          category in its own right, equal to the other two, and belongs
          here.

          Futures stays in the tab row deliberately. It is the one mode with
          a season-long horizon rather than a slate, so it reads as a
          destination rather than a way of betting today's games.

          Hidden in futures mode only, where none of the three applies. */}
      {!isFuturesMode && (
        <div className="flex rounded-xl border border-text-primary/20 p-1 mb-4">
          {['Straight', 'Parlay', 'Props'].map((mode) => {
            const isActive = mode === 'Props'
              ? isPropsMode
              : isPropsMode ? false : (mode === 'Parlay' ? parlayMode : !parlayMode)
            return (
              <button
                key={mode}
                {...(mode === 'Parlay' ? { 'data-onboarding': 'parlay-toggle' } : {})}
                {...(mode === 'Props' ? { 'data-onboarding': 'props-tab' } : {})}
                onClick={() => {
                  if (mode === 'Props') { setIsPropsMode(true); setIsFuturesMode(false); return }
                  // Leaving Props returns you to the slate, so the bet type
                  // you pick here has to be applied as you arrive.
                  setIsPropsMode(false)
                  setParlayMode(mode === 'Parlay')
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isActive ? 'bg-accent text-white' : 'text-text-primary hover:bg-text-primary/10'
                }`}
              >
                {mode}
              </button>
            )
          })}
        </div>
      )}

      {/* Sport tabs + Futures. Hidden in Props mode: PropsSection brings its
          own sport tiles, and two sport pickers stacked on one screen is a
          question asked twice. Every other mode shares this row. */}
      <div className={`flex overflow-x-auto gap-2 pb-2 mb-4 scrollbar-hide -mx-4 px-4 ${isPropsMode ? 'hidden' : ''}`}>
        {sortedTabs.filter((t) => activeKeys.has(t.key)).map((tab) => {
          const isActive = activeSport === tab.key && !isFuturesMode && !isPropsMode
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveSport(tab.key); setIsFuturesMode(false); setIsPropsMode(false) }}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-accent text-white'
                  : 'bg-bg-primary border border-text-primary/20 text-text-primary hover:border-text-primary/40'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
        {/* Futures sits at the right edge of the live tabs, always */}
        <button
          onClick={() => { setIsFuturesMode(true); setIsPropsMode(false) }}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            isFuturesMode
              ? 'bg-accent text-white'
              : 'bg-bg-primary border border-text-primary/20 text-text-primary hover:border-text-primary/40'
          }`}
        >
          Futures
        </button>
        {/* Inactive (out-of-season) sports follow, grayed out */}
        {sortedTabs.filter((t) => !activeKeys.has(t.key)).map((tab) => {
          const isActive = activeSport === tab.key && !isFuturesMode && !isPropsMode
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveSport(tab.key); setIsFuturesMode(false); setIsPropsMode(false) }}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-accent text-white'
                  : 'bg-bg-primary border border-text-primary/20 text-text-primary hover:border-text-primary/40'
              } opacity-50`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {isPropsMode ? (
        <PropsSection />
      ) : isFuturesMode ? (
        <FuturesSection />
      ) : (
        <>
          {/* Day Navigation */}
          <div className="flex items-center justify-between rounded-xl border border-text-primary/20 px-4 py-3 mb-6">
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
              {filteredGames.map((game, index) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isFirstCard={index === 0}
                  userPick={picksMap[game.id]}
                  onPick={handlePick}
                  onUndoPick={handleUndoPick}
                  isSubmitting={submitPick.isPending || deletePick.isPending}
                  parlayMode={parlayMode}
                  parlayPickedTeam={parlayLegsMap[game.id] || null}
                  onParlayToggle={handleParlayToggle}
                  hasInjuryData={INTEL_SPORTS.has(sportKey)}
                  onInjuryClick={() => setInjuryGameId(game.id)}
                  // Both affordances open the pregame intel modal. Tapping the
                  // card used to open the old GameDetailModal (since deleted),
                  // which rendered records and a box score but NOT GamePreview — and this page only ever
                  // lists upcoming games, where a box score doesn't exist yet.
                  // For NCAAF, whose records are also absent pre-season, that
                  // left a modal titled "Game Intel" over nothing at all.
                  onCardClick={GAME_INTEL_SPORTS.has(sportKey) ? () => setInjuryGameId(game.id) : undefined}
                  sportKey={sportKey}
                />
              ))}
            </div>
          )}

        </>
      )}

      {/* Shown on the games list AND the Props tab — it summarises straight
          picks and prop picks together, so it has to survive the switch to
          Props, where picks can still be added. It used to live inside the
          games branch and vanished there, taking the running risk/reward
          with it.
          Futures is excluded on purpose: those don't feed this bar.
          Page root already carries pb-32, so the fixed bar never covers
          content. */}
      {!isFuturesMode && (
        parlayMode ? <ParlaySlip /> : <BottomBar picks={pendingPicksMap} games={allGames} propPicks={pendingPropPicks} profile={profile} onUpdateMultiplier={handleUpdateMultiplier} />
      )}

      <GameIntelModal gameId={injuryGameId} onClose={() => setInjuryGameId(null)} />
    </div>
  )
}
