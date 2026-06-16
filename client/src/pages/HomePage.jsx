import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import InfoTooltip from '../components/ui/InfoTooltip'
import OpenLeaguesSection from '../components/home/OpenLeaguesSection'
import TierUsersModal from '../components/home/TierUsersModal'
import { useMyLeagues } from '../hooks/useLeagues'
import { useMyPicks } from '../hooks/usePicks'
import { getTier } from '../lib/scoring'
import TierBadge from '../components/ui/TierBadge'
import Avatar from '../components/ui/Avatar'
import { getBackdropUrl } from '../lib/backdropUrl'
import { useLandingPreview } from '../hooks/useLandingPreview'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../lib/teamLogos'

const tiers = [
  { name: 'Learning', points: '<0', color: 'border-tier-lost text-tier-lost', desc: 'Finding your way' },
  { name: 'Rookie', points: '0+', color: 'border-tier-rookie text-tier-rookie', desc: 'Just getting started' },
  { name: 'Baller', points: '100+', color: 'border-tier-baller text-tier-baller', desc: 'Proving yourself' },
  { name: 'Elite', points: '500+', color: 'border-tier-elite text-tier-elite', desc: 'A True Pro' },
  { name: 'Hall of Famer', points: '1,000+', color: 'border-tier-hof text-tier-hof', desc: 'Legendary status' },
  { name: 'GOAT', points: '3,000+', color: 'border-tier-goat text-tier-goat', desc: 'Undisputed' },
]

function WelcomeCard({ userId, profile }) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(`ikb_welcome_dismissed_${userId}`) === '1')

  // Derive checklist from actual user data so it survives localStorage clears.
  // display_name on its own doesn't count — the server auto-fills it with the
  // username at signup, so every new account would otherwise read "done." We
  // want signals the user actually edited something: avatar, emoji, bio, a
  // display_name they changed from their username, or any social handle.
  const hasProfile = !!(
    profile?.avatar_url ||
    profile?.avatar_emoji ||
    profile?.bio ||
    (profile?.display_name && profile.display_name !== profile.username) ||
    profile?.x_handle ||
    profile?.instagram_handle ||
    profile?.tiktok_handle ||
    profile?.snapchat_handle ||
    profile?.youtube_handle ||
    profile?.threads_handle
  )
  // Latch first_pick: once points go non-zero, persist the flag so returning to 0 doesn't reset it
  if (profile?.total_points != null && profile.total_points !== 0) {
    localStorage.setItem(`ikb_welcome_first_pick_${userId}`, '1')
  }
  const hasPicks = localStorage.getItem(`ikb_welcome_first_pick_${userId}`) === '1'
  const readFaq = localStorage.getItem(`ikb_welcome_read_faq_${userId}`) === '1'

  const checklist = { first_pick: hasPicks, read_faq: readFaq, setup_profile: hasProfile }

  const [, forceUpdate] = useState(0)
  // Re-check when returning to this page
  useEffect(() => {
    function refresh() { forceUpdate((n) => n + 1) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const allDone = checklist.first_pick && checklist.read_faq && checklist.setup_profile
  if (allDone || dismissed) return null

  const items = [
    {
      key: 'first_pick',
      label: 'Make Your First Pick',
      done: checklist.first_pick,
      onClick: () => navigate('/picks'),
    },
    {
      key: 'read_faq',
      label: 'Read the FAQ',
      done: checklist.read_faq,
      onClick: () => {
        // Mark read on tap so it persists on next render via the
        // localStorage check above. forceUpdate keeps this render
        // honest. Previously called a non-existent setChecklist
        // which threw and silently killed navigation.
        localStorage.setItem(`ikb_welcome_read_faq_${userId}`, '1')
        forceUpdate((n) => n + 1)
        navigate('/faq')
      },
    },
    {
      key: 'setup_profile',
      label: 'Set Up Your Profile',
      done: checklist.setup_profile,
      onClick: () => navigate('/settings'),
    },
  ]

  return (
    <div className="bg-bg-primary border border-text-primary/20 rounded-2xl p-6 mb-8">
      <h2 className="font-display text-2xl text-accent mb-2">Welcome to I KNOW BALL</h2>
      <p className="text-text-secondary mb-4">You're in. Here's how to get started:</p>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left border transition-colors ${
              item.done
                ? 'bg-bg-primary border-correct/30 text-correct hover:bg-correct/5'
                : 'bg-bg-primary border-text-primary/20 text-text-primary hover:border-accent hover:text-accent'
            }`}
          >
            {item.done ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-text-muted flex-shrink-0" />
            )}
            <span className={`font-semibold text-sm ${item.done ? 'line-through opacity-70' : ''}`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          localStorage.setItem(`ikb_welcome_dismissed_${userId}`, '1')
          setDismissed(true)
        }}
        className="mt-4 text-xs text-text-muted hover:text-text-primary transition-colors"
      >
        Dismiss
      </button>
    </div>
  )
}

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA DFS',
  wnba_dfs: 'WNBA DFS',
  mlb_dfs: 'MLB DFS',
  hr_derby: 'HR Derby',
  strikeouts: 'Strikeouts',
  three_point: 'NBA 3PT Contest',
  wnba_three_point: 'WNBA 3PT Contest',
  sacks: 'Sacks',
  ints: 'INTs',
  tackles: 'Tackles',
  receptions: 'Recs',
  td_pass: 'TD Pass',
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
  soccer_world_cup: 'World Cup',
  americanfootball_ufl: 'UFL',
  all: 'All Sports',
}

function MyProfileRow({ profile }) {
  const navigate = useNavigate()
  const tier = getTier(profile.total_points)
  const hasBackdrop = !!profile.backdrop_image
  const { data: lockedPicks } = useMyPicks('locked')
  const lockedCount = lockedPicks?.length || 0

  return (
    <div
      onClick={() => navigate('/hub')}
      className={`relative bg-bg-primary/80 backdrop-blur-sm border border-white/15 rounded-2xl cursor-pointer hover:border-accent/40 transition-colors overflow-hidden max-w-3xl mx-auto ${hasBackdrop ? 'p-5 lg:p-6' : 'p-5 lg:p-6'}`}
    >
      {hasBackdrop && (
        <>
          <img
            src={getBackdropUrl(profile.backdrop_image)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
            style={{ objectPosition: `center ${profile.backdrop_y ?? 50}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/80 via-bg-primary/50 to-bg-primary/80 pointer-events-none" />
        </>
      )}
      <div className="relative z-10 flex items-center gap-4">
        <Avatar user={profile} size="2xl" className="bg-accent/15 border border-accent/25" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl lg:text-2xl truncate text-white">{profile.display_name || profile.username}</div>
          <div className="text-text-muted text-sm">@{profile.username}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <TierBadge tier={tier.name} size="md" />
          <span className="text-white font-display text-lg lg:text-xl">{profile.total_points} pts</span>
          {profile.rank && (
            <span className="text-text-muted text-xs">#{profile.rank} overall</span>
          )}
        </div>
      </div>
      {lockedCount > 0 && (
        <div className="relative z-10 mt-3 pt-3 border-t border-white/10 text-center">
          <span className="text-sm text-accent font-semibold">{lockedCount} pick{lockedCount !== 1 ? 's' : ''} locked in today</span>
        </div>
      )}
    </div>
  )
}

// Formats that already contain the sport name in their label
const SPORT_IN_FORMAT = { nba_dfs: true, wnba_dfs: true, mlb_dfs: true }

function formatWithSport(league) {
  const label = FORMAT_LABELS[league.format] || league.format
  if (SPORT_IN_FORMAT[league.format]) return label
  const sport = SPORT_LABELS[league.sport] || league.sport
  return `${label} · ${sport}`
}

function MyActiveLeagues() {
  const { data: leagues, isLoading } = useMyLeagues()

  const active = (leagues || []).filter((l) => l.status !== 'completed')

  if (isLoading || !active.length) return null

  return (
    <div className="mb-8 xl:-mx-24">
      <h2 className="font-display text-xl mb-4">Your Leagues</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {active.map((league) => (
          <Link
            key={league.id}
            to={`/leagues/${league.id}`}
            className="relative flex-shrink-0 w-52 rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden hover:border-accent/40 transition-colors"
          >
            {/* Readiness color clip */}
            {league.readiness && !league.survivor_eliminated && (
              <span className={`absolute top-0 right-0 w-2.5 h-2.5 rounded-bl-md z-20 ${
                league.readiness === 'ready' ? 'bg-correct'
                  : league.readiness === 'attention' ? 'bg-yellow-500'
                  : 'bg-incorrect'
              }`} />
            )}
            {league.backdrop_image && (
              <>
                <img
                  src={getBackdropUrl(league.backdrop_image)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
                  style={{ objectPosition: `center ${league.backdrop_y ?? 50}%` }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-bg-primary/40 to-bg-primary/80 pointer-events-none" />
              </>
            )}
            <div className="relative p-4">
              <div className="font-semibold text-sm text-white truncate mb-1">{league.name}</div>
              <div className="text-xs text-text-muted mb-2">{formatWithSport(league)}</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">{league.member_count} members</span>
              </div>
              {league.format === 'survivor' && league.status === 'active' && league.survivor_alive != null && (
                <div className="mt-2 text-xs text-correct font-semibold text-right">{league.survivor_alive} still alive</div>
              )}
              {league.draft_status === 'in_progress' ? (
                <div className="mt-2 text-center font-display text-sm font-bold text-correct uppercase tracking-wide">Drafting Now</div>
              ) : league.draft_date && league.draft_status === 'pending' && (
                <div className="mt-2 text-center font-semibold text-sm text-accent uppercase tracking-wide">
                  {(() => {
                    const target = new Date(league.draft_date)
                    const dayDiff = Math.round((target.setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
                    const time = new Date(league.draft_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                    if (dayDiff <= 0) return `Draft today at ${time}`
                    if (dayDiff === 1) return `Draft tomorrow at ${time}`
                    return `Draft in ${dayDiff} days`
                  })()}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// Format card — used for every league-format entry on the landing page.
// One styling pattern, two sizes (regular vs featured). Mobile-tight
// padding so single-stat contests don't get tall on small screens.
function FormatCard({ title, desc, gradient, sports, featured = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-left rounded-2xl border border-text-primary/20 bg-bg-primary overflow-hidden hover:border-accent/50 transition-colors ${
        featured ? 'sm:max-w-3xl sm:mx-auto block' : ''
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none`} />
      <div className={`relative ${featured ? 'p-5 sm:p-8' : 'p-4 sm:p-6'}`}>
        {featured && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-accent">Featured</span>
          </div>
        )}
        <h3 className={`font-display text-white mb-1.5 ${featured ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{title}</h3>
        <p className={`text-text-secondary leading-relaxed mb-2 ${featured ? 'text-sm sm:text-base max-w-2xl' : 'text-sm'}`}>{desc}</p>
        <div className="text-xs text-text-muted">{sports}</div>
      </div>
    </button>
  )
}

export default function HomePage() {
  const { isAuthenticated, profile, session } = useAuth()
  const navigate = useNavigate()
  const [selectedTier, setSelectedTier] = useState(null)

  // Touch vs mouse — swaps "Tap" / "Click" in the league-section subtitle.
  // matchMedia '(hover: none)' is true on touch devices (no hover capability).
  const [actionWord, setActionWord] = useState('Tap')
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(hover: hover)')
    setActionWord(mq.matches ? 'Click' : 'Tap')
    const handler = (e) => setActionWord(e.matches ? 'Click' : 'Tap')
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [])

  // Card → create-league flow. Unauth users get stashed an intent so the
  // signup/payment funnel can drop them on /leagues/create with the right
  // format pre-selected on the other side. Paid users go direct.
  function handleStartLeague(format, sport) {
    try {
      localStorage.setItem('pendingCreateFormat', JSON.stringify({ format, sport: sport || null }))
    } catch {}
    if (!isAuthenticated) {
      navigate('/signup')
    } else if (!profile?.is_paid) {
      navigate('/payment')
    } else {
      const params = new URLSearchParams({ format })
      if (sport) params.set('sport', sport)
      try { localStorage.removeItem('pendingCreateFormat') } catch {}
      navigate(`/leagues/create?${params.toString()}`)
    }
  }

  // Cycling backdrop has moved into HeroLayout so it persists across
  // /signup, /login, /payment navigations. HomePage's own hero block was
  // stripped along with the local HERO_IMAGES + heroIdx state.

  const { data: landingPreview } = useLandingPreview()
  const previewMlb = landingPreview?.mlbGame
  const previewFutures = landingPreview?.nbaFutures

  // Redirect authenticated but unpaid users to payment.
  // Must come AFTER all hooks above — early returning before later hooks
  // causes a "rendered fewer hooks than expected" error (React #300) when
  // is_paid flips from true to false between renders.
  if (isAuthenticated && profile && !profile.is_paid) {
    return <Navigate to="/payment" replace />
  }

  return (
    <div>
      {/* Hero (wordmark + cycling backdrops) is owned by HeroLayout — this
          page renders the tagline + CTA row directly under the wordmark.
          The tagline stays HERE on the homepage but is intentionally
          absent from /signup, /login, /payment (where the form card is
          the focus). */}
      <div className="text-center mb-10 sm:mb-14">
        <p className="text-white/90 text-lg sm:text-xl max-w-lg mx-auto mb-7 drop-shadow">
          Win leagues. Pick winners.<br />Prove you know ball.
        </p>
        {!isAuthenticated ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <Link to="/signup" className="text-center bg-white/5 backdrop-blur-md border border-accent/50 hover:border-accent hover:bg-white/10 text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors">
              Sign Up
            </Link>
            <Link to="/login" className="text-center bg-white/5 backdrop-blur-md border border-white/20 hover:border-white/40 hover:bg-white/10 text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors">
              Sign In
            </Link>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <Link to="/leagues" className="text-center bg-white/5 backdrop-blur-md border border-accent/50 hover:border-accent hover:bg-white/10 text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors">
              Go to Leagues
            </Link>
            <Link to="/picks" className="text-center bg-white/5 backdrop-blur-md border border-accent/50 hover:border-accent hover:bg-white/10 text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors">
              Make Your Picks
            </Link>
          </div>
        )}
      </div>

      {/* Content container */}
      <div className="max-w-2xl lg:max-w-5xl mx-auto py-4 sm:py-8">

      {/* Welcome Card — new users only (account < 7 days old, not all tasks done) */}
      {isAuthenticated && profile?.created_at && (Date.now() - new Date(profile.created_at).getTime() < 7 * 24 * 60 * 60 * 1000) && (
        <WelcomeCard userId={session?.user?.id} profile={profile} />
      )}

      {/* Logged-in: Open Leagues + Active Leagues */}
      {isAuthenticated && (
        <>
          <MyActiveLeagues />
          <OpenLeaguesSection />
        </>
      )}

      {/* Logged-out showcase */}
      {!isAuthenticated && (
        <>
        {/* League Formats */}
        <div className="mb-16">
          <h2 className="font-display text-3xl text-center mb-3">Run Your League</h2>
          <p className="text-text-muted text-center mb-8 max-w-xl mx-auto">
            18 formats. 10 sports. Play all year round. {actionWord} a card to start a league.
          </p>

          {/* Row 1: Fantasy Football (featured, consolidated) */}
          <div className="mb-4">
            <FormatCard
              featured
              title="Fantasy Football"
              desc="Two ways to play: full snake-draft season league (waivers, trades, playoff bracket) or weekly Salary Cap (no draft, fresh roster every week). Fast stat updates, sharp visuals."
              gradient="from-green-800/30 via-green-900/20 to-transparent"
              sports="NFL"
              onClick={() => handleStartLeague('fantasy')}
            />
          </div>

          {/* Row 2: Pick'em + Survivor + Brackets */}
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            {[
              { title: "Pick'em", desc: 'Pick the winners. Most points at the end wins.', gradient: 'from-orange-700/25 via-orange-900/15 to-transparent', sports: 'NFL · NBA · MLB · NHL · NCAA', format: 'pickem' },
              { title: 'Survivor', desc: "Pick one team per period. Lose, you burn a life. Can't reuse a team. Last one standing wins.", gradient: 'from-red-800/25 via-red-900/15 to-transparent', sports: 'NFL · NBA · MLB · NHL · NCAA', format: 'survivor' },
              { title: 'Brackets', desc: 'Fill out a tournament bracket. Most points across all rounds wins.', gradient: 'from-violet-800/25 via-violet-900/15 to-transparent', sports: 'NCAAB · NFL · NBA · All Playoffs', format: 'bracket' },
            ].map((mode) => (
              <FormatCard key={mode.title} {...mode} onClick={() => handleStartLeague(mode.format)} />
            ))}
          </div>

          {/* Row 3: TD Survivor + Passing TD + Daily Fantasy (consolidated NBA + MLB DFS) */}
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            {[
              { title: 'Touchdown Survivor', desc: 'Pick a player to score a non-passing TD each week. Miss, you burn a life.', gradient: 'from-rose-800/25 via-rose-900/15 to-transparent', sports: 'NFL', format: 'survivor', sport: 'americanfootball_nfl' },
              { title: 'Passing TD Competition', desc: 'Pick a QB each week (no repeats). Most passing TDs across the season wins.', gradient: 'from-cyan-800/25 via-cyan-900/15 to-transparent', sports: 'NFL', format: 'td_pass' },
              { title: 'Daily Fantasy', desc: 'Build a fresh lineup every game day under a salary cap. No draft, no season commitment.', gradient: 'from-blue-800/25 via-blue-900/15 to-transparent', sports: 'NBA · MLB', format: null /* sport-picker on next step */ },
            ].map((mode) => (
              <FormatCard
                key={mode.title}
                {...mode}
                onClick={() => {
                  if (mode.format) {
                    handleStartLeague(mode.format, mode.sport)
                  } else {
                    // Daily Fantasy — no format preset; user picks NBA vs MLB on create page
                    handleStartLeague('nba_dfs') // default into NBA DFS; create page lets them flip
                  }
                }}
              />
            ))}
          </div>

          {/* Row 4: Squares + Home Run Derby */}
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {[
              { title: 'Squares', desc: 'Pick squares on a 10×10 grid. Score lands on your row+column at the end of any quarter, you win that quarter.', gradient: 'from-purple-800/25 via-purple-900/15 to-transparent', sports: 'NFL · NBA · MLB · NCAA', format: 'squares' },
              { title: 'Home Run Derby', desc: 'Pick 3 hitters per day. Most home runs across the season wins.', gradient: 'from-amber-800/25 via-amber-900/15 to-transparent', sports: 'MLB', format: 'hr_derby' },
            ].map((mode) => (
              <FormatCard key={mode.title} {...mode} onClick={() => handleStartLeague(mode.format)} />
            ))}
          </div>

          {/* Row 5: stat-collection contests — short copy so the cards
              don't get tall on mobile where they're full-width. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: '3-Point Contest', desc: 'Pick 3 shooters per night. Most threes wins.', gradient: 'from-orange-700/25 via-orange-900/15 to-transparent', sports: 'NBA · WNBA', format: 'three_point' },
              { title: 'Strikeouts Contest', desc: 'Pick 3 pitchers per day. Most strikeouts wins.', gradient: 'from-blue-800/25 via-blue-900/15 to-transparent', sports: 'MLB', format: 'strikeouts' },
              { title: 'Sacks Contest', desc: 'Pick 3 defenders per week. Most sacks wins.', gradient: 'from-rose-800/25 via-rose-900/15 to-transparent', sports: 'NFL', format: 'sacks' },
              { title: 'Interceptions Contest', desc: 'Pick 3 defenders per week. Most interceptions wins.', gradient: 'from-cyan-800/25 via-cyan-900/15 to-transparent', sports: 'NFL', format: 'ints' },
              { title: 'Tackles Contest', desc: 'Pick 3 defenders per week. Most tackles wins.', gradient: 'from-emerald-800/25 via-emerald-900/15 to-transparent', sports: 'NFL', format: 'tackles' },
              { title: 'Receptions Contest', desc: 'Pick 3 pass catchers per week. Most receptions wins.', gradient: 'from-yellow-800/25 via-yellow-900/15 to-transparent', sports: 'NFL', format: 'receptions' },
            ].map((mode) => (
              <FormatCard key={mode.title} {...mode} onClick={() => handleStartLeague(mode.format)} />
            ))}
          </div>
        </div>

        {/* Pick Winners + Props — live preview cards */}
        <div className="mb-16">
          <h2 className="font-display text-3xl text-center mb-3">Pick Winners. Build Your Record.</h2>
          <p className="text-text-muted text-center mb-8 max-w-2xl mx-auto">Beyond leagues, every pick counts toward your global score. Climb from Rookie to GOAT.</p>

          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            {/* Game Pick Preview — live MLB game when available, else fallback */}
            {(() => {
              const homeName = previewMlb?.homeTeam || 'New York Yankees'
              const awayName = previewMlb?.awayTeam || 'Los Angeles Angels'
              const homeLogo = getTeamLogoUrl(homeName, 'baseball_mlb') || getTeamLogoFallbackUrl(homeName, 'baseball_mlb')
              const awayLogo = getTeamLogoUrl(awayName, 'baseball_mlb') || getTeamLogoFallbackUrl(awayName, 'baseball_mlb')
              const awayRisk = previewMlb?.awayRisk ?? 10
              const awayReward = previewMlb?.awayReward ?? 15
              const homeRisk = previewMlb?.homeRisk ?? 10
              const homeReward = previewMlb?.homeReward ?? 6
              const awayIsFav = previewMlb ? !previewMlb.homeIsFavorite : false
              const homeIsFav = previewMlb ? previewMlb.homeIsFavorite : true
              return (
                <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
                  <div className="text-xs font-bold uppercase tracking-wider text-accent mb-4">Game Picks</div>
                  <div className="rounded-xl border border-text-primary/15 bg-black/30 p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {awayLogo && <img src={awayLogo} alt="" className="w-8 h-8 object-contain shrink-0" />}
                        <span className="font-semibold text-text-primary break-words">{awayName}</span>
                      </div>
                      <span className={`text-xs font-semibold whitespace-nowrap shrink-0 mt-2 ${awayIsFav ? 'text-accent' : 'text-correct'}`}>
                        Risk {awayRisk} → Win {awayReward}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {homeLogo && <img src={homeLogo} alt="" className="w-8 h-8 object-contain shrink-0" />}
                        <span className="font-semibold text-text-primary break-words">{homeName}</span>
                      </div>
                      <span className={`text-xs font-semibold whitespace-nowrap shrink-0 mt-2 ${homeIsFav ? 'text-accent' : 'text-correct'}`}>
                        Risk {homeRisk} → Win {homeReward}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-text-primary/10 text-center">
                      <span className="text-xs text-text-muted">Underdogs earn more points · Favorites pay less</span>
                    </div>
                  </div>
                  <p className="text-sm text-text-secondary mt-4 leading-relaxed">Pick the winner of any game, any sport. Underdogs earn more points. Every correct pick earns points — every miss costs 10.</p>
                </div>
              )
            })()}

            {/* Prop Pick Preview — static placeholder */}
            <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-accent mb-4">Player Props</div>
              <div className="rounded-xl border border-text-primary/15 bg-black/30 p-4">
                <div className="text-center mb-3">
                  <img src="https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png" alt="Lamar Jackson" className="w-14 h-14 rounded-full object-cover bg-bg-secondary mx-auto mb-2" />
                  <div className="font-semibold text-text-primary">Lamar Jackson</div>
                  <div className="text-xs text-text-muted">Passing Yards</div>
                </div>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="flex-1 text-center py-2.5 rounded-lg border border-text-primary/20 bg-black/20">
                    <div className="text-xs text-text-muted mb-0.5">Over 300</div>
                    <div className="text-xs font-semibold text-text-primary">Risk 10 → Win 25</div>
                  </div>
                  <div className="text-xs text-text-muted font-bold">300</div>
                  <div className="flex-1 text-center py-2.5 rounded-lg border border-text-primary/20 bg-black/20">
                    <div className="text-xs text-text-muted mb-0.5">Under 300</div>
                    <div className="text-xs font-semibold text-text-primary">Risk 10 → Win 5</div>
                  </div>
                </div>
              </div>
              <p className="text-sm text-text-secondary mt-4 leading-relaxed">Predict player performances — points, rebounds, strikeouts, home runs. New props drop daily for every sport in season.</p>
            </div>

            {/* Futures Preview — live NBA championship odds when available */}
            {(() => {
              const fallback = {
                title: '2026 NBA Championship',
                outcomes: [
                  { name: 'Boston Celtics', risk: 10, reward: 14 },
                  { name: 'OKC Thunder', risk: 10, reward: 18 },
                  { name: 'Cleveland Cavaliers', risk: 10, reward: 22 },
                  { name: 'New York Knicks', risk: 10, reward: 30 },
                ],
              }
              const market = previewFutures || fallback
              return (
                <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
                  <div className="text-xs font-bold uppercase tracking-wider text-accent mb-4">Futures</div>
                  <div className="rounded-xl border border-text-primary/15 bg-black/30 p-4 relative overflow-hidden">
                    <div className="text-center mb-3">
                      <div className="font-semibold text-text-primary">{market.title}</div>
                      <div className="text-xs text-text-muted">Pick the winner before the season ends</div>
                    </div>
                    <div className="space-y-1.5">
                      {market.outcomes.slice(0, 4).map((o, i) => (
                        <div
                          key={o.name}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border border-text-primary/20 bg-black/20 ${i === 3 ? 'opacity-50' : ''}`}
                        >
                          <span className="text-sm font-semibold text-text-primary truncate pr-2">{o.name}</span>
                          <span className="text-xs font-semibold whitespace-nowrap">
                            <span className="text-incorrect">-{o.risk}</span>{' '}
                            <span className="text-text-muted">→</span>{' '}
                            <span className="text-correct">+{o.reward}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                  </div>
                  <p className="text-sm text-text-secondary mt-4 leading-relaxed">Predict champions, MVPs, and tournament winners across every sport — including golf majors. Big risk, big reward.</p>
                </div>
              )
            })()}
          </div>

        </div>

        {/* Beyond the Games — Hub + Headlines */}
        <div className="mb-16">
          <h2 className="font-display text-3xl text-center mb-3">Connect and Compete</h2>
          <p className="text-text-muted text-center mb-8 max-w-2xl mx-auto">A full sports community with an engaging social feed and healthy competition.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-accent mb-3">The Hub</div>
              <h3 className="font-display text-lg text-white mb-2">Social Feed</h3>
              <p className="text-sm text-text-secondary leading-relaxed">Share posts, predictions, and polls. React to plays, see what the community is picking. Your own sports social network.</p>
            </div>
            <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-accent mb-3">Link Your Socials</div>
              <h3 className="font-display text-lg text-white mb-2">Get Followed</h3>
              <p className="text-sm text-text-secondary leading-relaxed">Add your Instagram, X, TikTok, and YouTube to your profile so other users can find you across every platform. Once people see you know ball, they'll want to follow you everywhere.</p>
            </div>
            <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-accent mb-3">Leaderboard</div>
              <h3 className="font-display text-lg text-white mb-2">Global Rankings</h3>
              <p className="text-sm text-text-secondary leading-relaxed">Compete against everyone on the platform. Points from picks, props, and league wins all count toward your rank.</p>
            </div>
          </div>
        </div>

        {/* Social proof strip */}
        <div className="mb-16 flex flex-wrap items-center justify-center gap-8 sm:gap-16 py-6 border-y border-text-primary/10">
          {[
            { value: '18', label: 'League Formats' },
            { value: '10', label: 'Sports Covered' },
            { value: '24/7', label: 'Live Odds' },
            { value: '∞', label: 'Leagues to Run' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-2xl sm:text-3xl text-accent">{stat.value}</div>
              <div className="text-xs text-text-muted mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
        </>
      )}

      {/* Tier Breakdown — always shown */}
      <div className="xl:-mx-24">
        <h2 className="font-display text-2xl text-center mb-8">
          Status Tiers
          <InfoTooltip text="Your status is based on your lifetime point total. Earn points by picking winners and winning leagues. Every wrong pick costs points. Climb from Rookie to GOAT." />
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl border-2 p-4 text-center ${tier.color} bg-bg-card ${isAuthenticated ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-transform' : ''}`}
              onClick={isAuthenticated ? () => setSelectedTier(tier) : undefined}
            >
              <div className="font-display text-xl mb-1">{tier.name}</div>
              <div className="text-sm text-text-primary mb-2">{tier.points} pts</div>
              <div className="text-sm text-text-primary">{tier.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 mb-4 flex flex-col items-center gap-2 text-xs text-text-muted">
        <p>
          Need help? <a href="mailto:admin@iknowball.club" className="text-accent hover:underline">admin@iknowball.club</a>
        </p>
        <div className="flex items-center gap-4">
          <Link to="/faq" className="hover:text-text-secondary transition-colors">FAQ</Link>
          <span>·</span>
          <Link to="/privacy" className="hover:text-text-secondary transition-colors">Privacy</Link>
        </div>
      </footer>

      <TierUsersModal tier={selectedTier} onClose={() => setSelectedTier(null)} />
      </div>
    </div>
  )
}
