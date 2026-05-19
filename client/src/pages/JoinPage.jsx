import { useState, useEffect } from 'react'
import { useParams, useNavigate, useOutletContext, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA Daily Fantasy',
  mlb_dfs: 'MLB Daily Fantasy',
  hr_derby: 'Home Run Derby',
  strikeouts: 'Strikeouts Contest',
  three_point: 'NBA 3-Point Contest',
  wnba_three_point: 'WNBA 3-Point Contest',
  sacks: 'Sacks Contest',
  ints: 'Interceptions Contest',
  tackles: 'Solo Tackles Contest',
  receptions: 'Receptions Contest',
  td_pass: 'TD Pass Competition',
}

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
  americanfootball_ufl: 'UFL',
  all: 'All Sports',
}

// One-line gut summary per format — gives the invitee an idea of what
// kind of game they're walking into without leaving the page.
const FORMAT_TAGLINES = {
  pickem: 'Pick the winners of the games. Most points at the end wins.',
  survivor: 'Pick one team per period. Last one standing wins.',
  bracket: 'Fill out a tournament bracket. Most points across all rounds wins.',
  squares: 'Claim a square on the 10x10 grid. Quarter scores pay out.',
  fantasy: 'Snake draft, weekly head-to-head, full playoff bracket.',
  nba_dfs: 'Build a new NBA lineup nightly under a salary cap.',
  mlb_dfs: 'Build a new MLB lineup nightly under a salary cap.',
  hr_derby: 'Pick 3 hitters per day. Most home runs across the season wins.',
  strikeouts: 'Pick 3 pitchers per day. Most strikeouts across the season wins.',
  three_point: 'Pick 3 NBA shooters per night. Most threes wins.',
  wnba_three_point: 'Pick 3 WNBA shooters per night. Most threes wins.',
  sacks: 'Pick 3 NFL defenders per week. Most sacks wins.',
  ints: 'Pick 3 NFL defenders per week. Most interceptions wins.',
  tackles: 'Pick 3 NFL defenders per week. Most solo tackles wins.',
  receptions: 'Pick 3 NFL pass catchers per week. Most receptions wins.',
  td_pass: 'Pick one QB per week (no repeats). Most passing TDs wins.',
}

export default function JoinPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { session, profile } = useAuthStore()
  const ctx = useOutletContext() || {}
  // HeroLayout has already fetched the league preview — reuse it instead
  // of double-fetching. Falls back to a local fetch if context's missing
  // (e.g. someone renders this page outside the layout).
  const [league, setLeague] = useState(ctx.leaguePreview || null)
  const [loading, setLoading] = useState(!ctx.leagueLoaded && !ctx.leaguePreview)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState(null)

  // Always stash the invite code on mount — HeroLayout uses it on subsequent
  // pages to keep the league backdrop visible through signup → payment.
  useEffect(() => {
    try { localStorage.setItem('pendingInviteCode', code.toUpperCase()) } catch {}
  }, [code])

  // Sync from layout context — when the layout finishes its own fetch, we
  // pick it up automatically.
  useEffect(() => {
    if (ctx.leaguePreview) {
      setLeague(ctx.leaguePreview)
      setLoading(false)
    } else if (ctx.leagueLoaded) {
      setLoading(false)
    }
  }, [ctx.leaguePreview, ctx.leagueLoaded])

  // Standalone fallback fetch (only fires if layout context never provides one)
  useEffect(() => {
    if (league || ctx.leagueLoaded) return
    const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
    fetch(`${BASE_URL}/leagues/preview/${code}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { setLeague(data); setLoading(false) })
      .catch(() => { setError('Invalid invite link'); setLoading(false) })
  }, [code, league, ctx.leagueLoaded])

  const handleJoin = async () => {
    setJoining(true)
    setError(null)
    try {
      const result = await api.post('/leagues/_/join', { invite_code: code.toUpperCase() })
      try { localStorage.removeItem('pendingInviteCode') } catch {}
      navigate(`/leagues/${result.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setJoining(false)
    }
  }

  if (loading) {
    return <div className="py-12 flex justify-center"><LoadingSpinner /></div>
  }

  if (!league) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-bg-primary/40 backdrop-blur-md rounded-2xl p-6 sm:p-7 border border-white/15 text-center">
          <h2 className="font-display text-2xl text-white mb-2">Invalid Invite</h2>
          <p className="text-white/80 text-sm mb-4">This invite link is not valid or has expired.</p>
          <Link to="/" className="text-accent hover:underline text-sm">Go to Home</Link>
        </div>
      </div>
    )
  }

  const formatLabel = FORMAT_LABELS[league.format] || league.format
  const sportLabel = SPORT_LABELS[league.sport] || league.sport
  const tagline = FORMAT_TAGLINES[league.format] || ''
  const isFull = league.max_members && league.member_count >= league.max_members
  const isClosed = league.status === 'completed'
  const isLoggedIn = !!session
  const isPaid = !!profile?.is_paid
  const commissionerName = league.users?.display_name || league.users?.username

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* League meta strip — sits on the hero's gradient */}
      <div className="flex flex-wrap gap-2 justify-center mb-5">
        <span className="text-[11px] font-bold uppercase tracking-wider bg-accent/20 border border-accent/50 text-accent px-3 py-1 rounded-full">
          {formatLabel}
        </span>
        {sportLabel && league.sport !== 'all' && (
          <span className="text-[11px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 text-white px-3 py-1 rounded-full">
            {sportLabel}
          </span>
        )}
        <span className="text-[11px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 text-white px-3 py-1 rounded-full">
          {league.member_count}{league.max_members ? `/${league.max_members}` : ''} members
        </span>
      </div>

      {/* Detail card */}
      <div className="bg-bg-primary/40 backdrop-blur-md rounded-2xl p-5 sm:p-6 border border-white/15 mb-4">
        {commissionerName && (
          <p className="text-white/80 text-sm text-center mb-3">
            Invited by <span className="font-semibold text-white">{commissionerName}</span>
          </p>
        )}
        {tagline && (
          <p className="text-white text-center text-sm sm:text-base leading-relaxed">
            {tagline}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-incorrect/15 border border-incorrect rounded-lg p-3 mb-4 text-sm text-incorrect">
          {error}
        </div>
      )}

      {/* Action */}
      {isClosed ? (
        <div className="bg-bg-primary/40 backdrop-blur-md rounded-2xl p-5 border border-white/15 text-center">
          <p className="text-white/85 mb-3">This league is no longer accepting members.</p>
          <Link to="/" className="text-accent hover:underline text-sm">Go to Home</Link>
        </div>
      ) : isFull ? (
        <div className="bg-bg-primary/40 backdrop-blur-md rounded-2xl p-5 border border-white/15 text-center">
          <p className="text-white/85 mb-3">This league is full.</p>
          <Link to="/" className="text-accent hover:underline text-sm">Go to Home</Link>
        </div>
      ) : !isLoggedIn ? (
        <div>
          <Link
            to="/signup"
            className="block w-full bg-accent hover:bg-accent-hover text-white font-display text-base sm:text-lg tracking-wide py-3.5 rounded-xl transition-colors text-center mb-3 shadow-lg"
          >
            Sign Up for I KNOW BALL to Join
          </Link>
          <p className="text-center text-white/85 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:underline">Log in</Link>
          </p>
        </div>
      ) : !isPaid ? (
        <Link
          to="/payment"
          className="block w-full bg-accent hover:bg-accent-hover text-white font-display text-base sm:text-lg tracking-wide py-3.5 rounded-xl transition-colors text-center shadow-lg"
        >
          Complete Payment to Join
        </Link>
      ) : (
        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full bg-accent hover:bg-accent-hover text-white font-display text-base sm:text-lg tracking-wide py-3.5 rounded-xl transition-colors disabled:opacity-50 shadow-lg"
        >
          {joining ? 'Joining...' : 'Join League'}
        </button>
      )}
    </div>
  )
}
