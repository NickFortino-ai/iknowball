import { useMemo } from 'react'
import { useGames } from '../hooks/useGames'
import { useMyPicks, useSubmitPick } from '../hooks/usePicks'
import GameCard from '../components/picks/GameCard'
import BottomBar from '../components/picks/BottomBar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { toast } from '../components/ui/Toast'

export default function PicksPage() {
  const { data: games, isLoading: gamesLoading } = useGames('americanfootball_nfl', 'upcoming')
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
    // If already picked this team, toggle off isn't supported (upsert only)
    try {
      await submitPick.mutateAsync({ gameId, pickedTeam: team })
      toast('Pick submitted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  if (gamesLoading || picksLoading) return <LoadingSpinner />

  const dates = Object.keys(grouped)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <h1 className="font-display text-3xl mb-6">Make Your Picks</h1>

      {dates.length === 0 ? (
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
