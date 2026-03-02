import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMyLeagues } from '../hooks/useLeagues'
import LeagueCard from '../components/leagues/LeagueCard'
import JoinLeagueModal from '../components/leagues/JoinLeagueModal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'

export default function LeaguesPage() {
  const { data: leagues, isLoading, isError, refetch } = useMyLeagues()
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const { active, completed } = useMemo(() => {
    if (!leagues) return { active: [], completed: [] }
    return {
      active: leagues.filter((l) => l.status !== 'completed'),
      completed: leagues.filter((l) => l.status === 'completed'),
    }
  }, [leagues])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="font-display text-3xl">My Leagues</h1>
        <div data-onboarding="leagues-actions" className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => setShowJoinModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors border border-border"
          >
            Join League
          </button>
          <Link
            to="/leagues/create"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors text-center"
          >
            Create League
          </Link>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState title="Failed to load leagues" message="Check your connection and try again." onRetry={refetch} />
      ) : !leagues?.length ? (
        <EmptyState
          title="No leagues yet"
          message="Create a league or join one with an invite code"
        />
      ) : (
        <>
          {active.length > 0 ? (
            <div className="space-y-3">
              {active.map((league) => (
                <LeagueCard key={league.id} league={league} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active leagues"
              message="Create a league or join one with an invite code"
            />
          )}

          {completed.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors mb-3"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Completed Leagues ({completed.length})
              </button>
              {showCompleted && (
                <div className="space-y-3">
                  {completed.map((league) => (
                    <LeagueCard key={league.id} league={league} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showJoinModal && <JoinLeagueModal onClose={() => setShowJoinModal(false)} />}
    </div>
  )
}
