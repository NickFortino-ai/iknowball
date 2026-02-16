import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
}

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  basketball_wncaab: 'WNCAAB',
  all: 'All Sports',
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export default function JoinPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { session, profile } = useAuthStore()
  const [league, setLeague] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState(null)

  // Store invite code and fetch preview
  useEffect(() => {
    localStorage.setItem('pendingInviteCode', code.toUpperCase())

    fetch(`${BASE_URL}/leagues/preview/${code}`)
      .then((res) => {
        if (!res.ok) throw new Error('Invalid invite code')
        return res.json()
      })
      .then(setLeague)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [code])

  const handleJoin = async () => {
    setJoining(true)
    setError(null)
    try {
      const result = await api.post('/leagues/_/join', { invite_code: code.toUpperCase() })
      localStorage.removeItem('pendingInviteCode')
      navigate(`/leagues/${result.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <LoadingSpinner />
      </div>
    )
  }

  if (error && !league) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-bg-card rounded-2xl p-8 border border-border text-center">
          <h1 className="font-display text-3xl mb-2">Invalid Invite</h1>
          <p className="text-text-secondary mb-6">This invite link is not valid or has expired.</p>
          <Link to="/" className="text-accent hover:underline text-sm">Go to Home</Link>
        </div>
      </div>
    )
  }

  const isFull = league.max_members && league.member_count >= league.max_members
  const isClosed = league.status !== 'open'
  const isLoggedIn = !!session
  const isPaid = !!profile?.is_paid

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-bg-card rounded-2xl p-8 border border-border">
        <h1 className="font-display text-3xl text-center mb-2">You've Been Invited</h1>
        <p className="text-text-secondary text-center mb-6">Join a league on I Know Ball</p>

        {/* League preview card */}
        <div className="bg-bg-primary rounded-xl border border-border p-5 mb-6">
          <h2 className="font-display text-2xl mb-3">{league.name}</h2>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent">
              {FORMAT_LABELS[league.format] || league.format}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-bg-card text-text-secondary">
              {SPORT_LABELS[league.sport] || league.sport}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-bg-card text-text-secondary">
              {league.member_count}{league.max_members ? `/${league.max_members}` : ''} members
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-incorrect-muted border border-incorrect rounded-lg p-3 mb-6 text-sm text-incorrect">
            {error}
          </div>
        )}

        {isClosed ? (
          <div className="text-center">
            <p className="text-text-secondary mb-4">This league is no longer accepting members.</p>
            <Link to="/" className="text-accent hover:underline text-sm">Go to Home</Link>
          </div>
        ) : isFull ? (
          <div className="text-center">
            <p className="text-text-secondary mb-4">This league is full.</p>
            <Link to="/" className="text-accent hover:underline text-sm">Go to Home</Link>
          </div>
        ) : !isLoggedIn ? (
          <div>
            <Link
              to="/signup"
              className="block w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors text-center mb-3"
            >
              Sign Up to Join
            </Link>
            <p className="text-center text-text-secondary text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-accent hover:underline">Log in</Link>
            </p>
          </div>
        ) : !isPaid ? (
          <Link
            to="/payment"
            className="block w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors text-center"
          >
            Complete Payment to Join
          </Link>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {joining ? 'Joining...' : 'Join League'}
          </button>
        )}
      </div>
    </div>
  )
}
