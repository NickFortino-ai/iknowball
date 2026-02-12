import { useState, useMemo } from 'react'
import { useGames } from '../hooks/useGames'
import { useMyPicks, useSubmitPick } from '../hooks/usePicks'
import GameCard from '../components/picks/GameCard'
import BottomBar from '../components/picks/BottomBar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { toast } from '../components/ui/Toast'

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NFL', key: 'americanfootball_nfl' },
]

export default function PicksPage() {
  const [activeSport, setActiveSport] = useState(0)
  const sportKey = sportTabs[activeSport].key

  const { data: games, isLoading: gamesLoading } = useGames(sportKey, 'upcoming')
  const { data: myPicks, isLoading: picksLoading } = useMyPicks()
  const submitPick = useSubmitPick()

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

  const grouped = useMemo(() => {
    if (!games) return {}
    const groups = {}
    for (const game of games) {
      const date = new Date(game.starts_at).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(game)
    }
    return groups
  }, [games])

  async function handlePick(gameId, team) {
    try {
      await submitPick.mutateAsync({ gameId, pickedTeam: team })
      toast('Pick submitted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  const dates = Object.keys(grouped)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <h1 className="font-display text-3xl mb-6">Make Your Picks</h1>

      <div className="flex gap-2 mb-6">
        {sportTabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => setActiveSport(i)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeSport === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {gamesLoading || picksLoading ? (
        <LoadingSpinner />
      ) : dates.length === 0 ? (
        <EmptyState title="No upcoming games" message="Check back when the season is active" />
      ) : (
        dates.map((date) => (
          <div key={date} className="mb-6">
            <h2 className="font-display text-lg text-text-secondary mb-3">{date}</h2>
            <div className="space-y-3">
              {grouped[date].map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  userPick={picksMap[game.id]}
                  onPick={handlePick}
                  isSubmitting={submitPick.isPending}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <BottomBar picks={pendingPicksMap} games={games} />
    </div>
  )
}
