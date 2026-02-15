import { useState, useMemo } from 'react'
import { useGames } from '../hooks/useGames'
import { useMyPicks, useSubmitPick, useDeletePick } from '../hooks/usePicks'
import GameCard from '../components/picks/GameCard'
import BottomBar from '../components/picks/BottomBar'
import FeaturedPropSection from '../components/picks/FeaturedPropSection'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { toast } from '../components/ui/Toast'
import InfoTooltip from '../components/ui/InfoTooltip'

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
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
  const [activeSport, setActiveSport] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)
  const sportKey = sportTabs[activeSport].key

  const { data: games, isLoading: gamesLoading } = useGames(sportKey, 'upcoming')
  const { data: myPicks, isLoading: picksLoading } = useMyPicks()
  const submitPick = useSubmitPick()
  const deletePick = useDeletePick()

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
        map[pick.game_id] = pick.picked_team
      }
    }
    return map
  }, [myPicks])

  const selectedDate = getDateOffset(dayOffset)

  const filteredGames = useMemo(() => {
    if (!games) return []
    return games.filter((game) => isSameDay(new Date(game.starts_at), selectedDate))
  }, [games, selectedDate])

  async function handlePick(gameId, team) {
    try {
      await submitPick.mutateAsync({ gameId, pickedTeam: team })
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
      <h1 className="font-display text-3xl mb-6">
        Make Your Picks
        <InfoTooltip text="Risk → Reward: You risk the red number on every pick. If you're right, you win the green number. If you're wrong, you lose the red number. Higher odds = higher reward but less likely to hit. Example: -10 → +19 means you risk 10 points to win 19 points." />
      </h1>

      <div className="flex overflow-x-auto gap-2 pb-2 mb-4 scrollbar-hide -mx-4 px-4">
        {sportTabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => setActiveSport(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeSport === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Day Navigation */}
      <div className="flex items-center justify-between bg-bg-card rounded-xl border border-border px-4 py-3 mb-6">
        <button
          onClick={() => setDayOffset((d) => Math.max(0, d - 1))}
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
          onClick={() => setDayOffset((d) => Math.min(2, d + 1))}
          disabled={dayOffset === 2}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-lg font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary hover:bg-bg-card-hover"
        >
          ›
        </button>
      </div>

      {/* Daily Featured Player Prop */}
      <FeaturedPropSection date={selectedDate} />

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
            />
          ))}
        </div>
      )}

      <BottomBar picks={pendingPicksMap} games={games} />
    </div>
  )
}
