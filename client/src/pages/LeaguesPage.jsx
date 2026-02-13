import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMyLeagues } from '../hooks/useLeagues'
import LeagueCard from '../components/leagues/LeagueCard'
import JoinLeagueModal from '../components/leagues/JoinLeagueModal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

export default function LeaguesPage() {
  const { data: leagues, isLoading } = useMyLeagues()
  const [showJoinModal, setShowJoinModal] = useState(false)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl">My Leagues</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJoinModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors border border-border"
          >
            Join League
          </button>
          <Link
            to="/leagues/create"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Create League
          </Link>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !leagues?.length ? (
        <EmptyState
          title="No leagues yet"
          message="Create a league or join one with an invite code"
        />
      ) : (
        <div className="space-y-3">
          {leagues.map((league) => (
            <LeagueCard key={league.id} league={league} />
          ))}
        </div>
      )}

      {showJoinModal && <JoinLeagueModal onClose={() => setShowJoinModal(false)} />}
    </div>
  )
}
