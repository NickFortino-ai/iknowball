import { useState, useEffect, useRef } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import InfoTooltip from '../components/ui/InfoTooltip'
import HeadlinesCard from '../components/home/HeadlinesCard'
import FeaturedPropSection from '../components/picks/FeaturedPropSection'
import OpenLeaguesSection from '../components/home/OpenLeaguesSection'
import TierUsersModal from '../components/home/TierUsersModal'

const tiers = [
  { name: 'Lost', points: '<0', color: 'border-tier-lost text-tier-lost', desc: 'Gone negative' },
  { name: 'Rookie', points: '0+', color: 'border-tier-rookie text-tier-rookie', desc: 'Just getting started' },
  { name: 'Baller', points: '100+', color: 'border-tier-baller text-tier-baller', desc: 'Proving yourself' },
  { name: 'Elite', points: '500+', color: 'border-tier-elite text-tier-elite', desc: 'A True Pro' },
  { name: 'Hall of Famer', points: '1,000+', color: 'border-tier-hof text-tier-hof', desc: 'Legendary status' },
  { name: 'GOAT', points: '3,000+', color: 'border-tier-goat text-tier-goat', desc: 'Undisputed' },
]

function WelcomeCard({ userId }) {
  const navigate = useNavigate()
  const [checklist, setChecklist] = useState(() => ({
    first_pick: localStorage.getItem(`ikb_welcome_first_pick_${userId}`) === '1',
    read_faq: localStorage.getItem(`ikb_welcome_read_faq_${userId}`) === '1',
    setup_profile: localStorage.getItem(`ikb_welcome_setup_profile_${userId}`) === '1',
  }))

  // Re-check localStorage when returning to this page (e.g. after making a pick)
  useEffect(() => {
    setChecklist({
      first_pick: localStorage.getItem(`ikb_welcome_first_pick_${userId}`) === '1',
      read_faq: localStorage.getItem(`ikb_welcome_read_faq_${userId}`) === '1',
      setup_profile: localStorage.getItem(`ikb_welcome_setup_profile_${userId}`) === '1',
    })
  }, [userId])

  const allDone = checklist.first_pick && checklist.read_faq && checklist.setup_profile
  if (allDone) return null

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
        localStorage.setItem(`ikb_welcome_read_faq_${userId}`, '1')
        setChecklist((prev) => ({ ...prev, read_faq: true }))
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
    <div className="bg-bg-card rounded-2xl border border-border p-6 mb-8">
      <h2 className="font-display text-2xl text-accent mb-2">Welcome to I KNOW BALL</h2>
      <p className="text-text-secondary mb-4">You're in. Here's how to get started:</p>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
              item.done
                ? 'bg-correct/10 text-correct'
                : 'bg-bg-card-hover hover:bg-accent/10 text-text-primary hover:text-accent'
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
    </div>
  )
}

export default function HomePage() {
  const { isAuthenticated, profile, session } = useAuth()
  const [searchParams] = useSearchParams()
  const forceHeadlines = searchParams.get('headlines') === '1'
  const [selectedTier, setSelectedTier] = useState(null)
  const headlinesRef = useRef(null)

  // Auto-scroll to headlines when coming from notification
  useEffect(() => {
    if (forceHeadlines && headlinesRef.current) {
      setTimeout(() => {
        headlinesRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    }
  }, [forceHeadlines])

  // Redirect authenticated but unpaid users to payment
  if (isAuthenticated && profile && !profile.is_paid) {
    return <Navigate to="/payment" replace />
  }

  const HERO_IMAGES = [
    '/backdrops/nba-msg.webp',
    '/backdrops/nfl-lambeau.webp',
    '/backdrops/mlb-wrigley.webp',
    '/backdrops/nba-american-airlines.webp',
    '/backdrops/nfl-superdome.webp',
    '/backdrops/mlb-fenway.webp',
    '/backdrops/nba-intuit-dome.webp',
    '/backdrops/nfl-arrowhead.webp',
    '/backdrops/mlb-dodger.webp',
    '/backdrops/nba-little-caesars.webp',
    '/backdrops/nfl-atandt.webp',
    '/backdrops/mlb-globe-life-field.webp',
    '/backdrops/nba-fiserv.webp',
    '/backdrops/nfl-gillette.webp',
    '/backdrops/mlb-pnc.webp',
    '/backdrops/nfl-us-bank.webp',
    '/backdrops/mlb-oracle.webp',
  ]
  const [heroIdx, setHeroIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setHeroIdx((i) => (i + 1) % HERO_IMAGES.length)
    }, 11000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      {/* Hero with cycling stadium backdrops — full width like league backdrops */}
      <div className="relative text-center mb-0 overflow-hidden">
        {/* Backdrop images */}
        <div className="absolute inset-0">
          {HERO_IMAGES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: i === heroIdx ? 1 : 0,
                transform: i === heroIdx ? 'scale(1.05)' : 'scale(1)',
                transition: i === heroIdx
                  ? 'opacity 2.5s ease-in-out, transform 15s ease-out'
                  : 'opacity 2.5s ease-in-out, transform 0.01s 2.6s',
              }}
              loading={i <= 1 ? 'eager' : 'lazy'}
            />
          ))}
          {/* Dark gradient overlay — stronger at bottom for fade into content */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-bg-primary" />
        </div>

        {/* Content */}
        <div className="relative z-10 py-16 sm:py-24 px-4">
          <h1 className="font-display text-5xl sm:text-7xl text-accent mb-4 tracking-tight drop-shadow-lg">
            I KNOW BALL
            <InfoTooltip text="I KNOW BALL is the all-in-one sports platform for people who live and breathe sports. Pick winners using live Vegas odds, run fantasy leagues with the best visuals in the game, and prove you actually know ball." />
          </h1>
          <p className="text-white/90 text-lg sm:text-xl max-w-lg mx-auto mb-8 drop-shadow">
            Win leagues. Pick winners.<br />Prove you know ball.
          </p>
          {!isAuthenticated ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/signup" className="w-full sm:w-auto text-center bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors shadow-lg">
                Sign Up
              </Link>
              <Link to="/login" className="w-full sm:w-auto text-center bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 text-white px-8 py-3 rounded-xl text-lg transition-colors">
                Sign In
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/leagues" className="w-full sm:w-auto text-center bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors shadow-lg">
                Go to Leagues
              </Link>
              <Link to="/picks" className="w-full sm:w-auto text-center bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors shadow-lg">
                Make Your Picks
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Content container */}
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-8 sm:py-12">

      {/* Welcome Card — new users only (account < 7 days old, not all tasks done) */}
      {isAuthenticated && profile?.created_at && (Date.now() - new Date(profile.created_at).getTime() < 7 * 24 * 60 * 60 * 1000) && (
        <WelcomeCard userId={session?.user?.id} />
      )}

      {/* Logged-in: Open Leagues + Featured Prop + Headlines */}
      {isAuthenticated && (
        <>
          <OpenLeaguesSection />
          <div className="mb-8 lg:max-w-3xl lg:mx-auto">
            <FeaturedPropSection date={new Date()} fallback defaultExpanded />
          </div>
          <div ref={headlinesRef}>
            <HeadlinesCard forceExpanded={forceHeadlines} />
          </div>
        </>
      )}

      {/* Logged-out showcase */}
      {!isAuthenticated && (
        <>
        {/* League Formats */}
        <div className="mb-16">
          <h2 className="font-display text-3xl text-center mb-3">Run Your League</h2>
          <p className="text-text-muted text-center mb-8 max-w-lg mx-auto">11 formats. 7 sports. Unlimited leagues. Play with friends all year round.</p>

          {/* Row 1: Traditional Fantasy Football (featured) + Salary Cap Fantasy Football */}
          <div className="grid lg:grid-cols-5 gap-4 mb-4">
            <Link to="/signup" className="group lg:col-span-3 relative rounded-2xl border border-text-primary/20 bg-bg-primary overflow-hidden hover:border-accent/50 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-green-800/30 via-green-900/20 to-transparent pointer-events-none" />
              <div className="relative p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-accent">Featured</span>
                </div>
                <h3 className="font-display text-2xl sm:text-3xl text-white mb-2">Traditional Fantasy Football</h3>
                <p className="text-sm text-text-secondary leading-relaxed mb-4 max-w-md">Snake draft, weekly lineups, waiver wire, trades, and a full playoff bracket. Fast, accurate stat updates, smooth user experience, and visually appealing. Commissioners love IKB.</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">NFL</span>
                  <span className="text-sm text-accent font-semibold group-hover:translate-x-0.5 transition-transform">Start Playing →</span>
                </div>
              </div>
            </Link>
            <Link to="/signup" className="group lg:col-span-2 relative rounded-2xl border border-text-primary/20 bg-bg-primary overflow-hidden hover:border-accent/50 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-800/25 via-emerald-900/15 to-transparent pointer-events-none" />
              <div className="relative p-6">
                <h3 className="font-display text-xl text-white mb-2">Salary Cap Fantasy Football</h3>
                <p className="text-sm text-text-secondary leading-relaxed mb-4">Draft under a salary cap — every player has a price. Build a new roster each week and compete for the highest score. No waivers, no trades, just roster-building strategy.</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">NFL</span>
                  <span className="text-xs text-accent font-semibold group-hover:translate-x-0.5 transition-transform">Start Playing →</span>
                </div>
              </div>
            </Link>
          </div>

          {/* Row 2: Pick'em + Survivor + Brackets */}
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            {[
              { title: "Pick'em", desc: 'Pick the winner of every game using real Vegas odds. Underdogs pay more, favorites pay less. Compete for the best record all season.', gradient: 'from-orange-700/25 via-orange-900/15 to-transparent', sports: 'NFL · NBA · MLB · NHL' },
              { title: 'Survivor', desc: "Pick one team to win each day. If they lose, you lose a life. Can't reuse a team. Last one standing wins.", gradient: 'from-red-800/25 via-red-900/15 to-transparent', sports: 'NFL · NBA · MLB · NHL' },
              { title: 'Brackets', desc: 'Fill out a bracket and compete with your league. March Madness, NFL playoffs, NBA playoffs — every major tournament covered.', gradient: 'from-violet-800/25 via-violet-900/15 to-transparent', sports: 'NCAAB · NFL · NBA · All Playoffs' },
            ].map((mode) => (
              <Link key={mode.title} to="/signup" className="group relative rounded-2xl border border-text-primary/20 bg-bg-primary overflow-hidden p-6 hover:border-accent/50 transition-colors">
                <div className={`absolute inset-0 bg-gradient-to-br ${mode.gradient} pointer-events-none`} />
                <div className="relative">
                  <h3 className="font-display text-lg text-white mb-2">{mode.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed mb-3">{mode.desc}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">{mode.sports}</span>
                    <span className="text-xs text-accent font-semibold group-hover:translate-x-0.5 transition-transform">Start Playing →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Row 3: TD Survivor + Passing TD Competition + NBA DFS */}
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            {[
              { title: 'Touchdown Survivor', desc: 'Pick one player to score a non-passing TD each week. Rush, reception, return — any TD counts. Miss and you lose a life.', gradient: 'from-rose-800/25 via-rose-900/15 to-transparent', sports: 'NFL' },
              { title: 'Passing TD Competition', desc: 'Pick the QB you think will throw the most touchdowns each week. 20 legendary QBs to choose from — each usable only once.', gradient: 'from-cyan-800/25 via-cyan-900/15 to-transparent', sports: 'NFL' },
              { title: 'NBA Daily Fantasy', desc: 'Build a fresh roster every night under a salary cap. No draft, no season commitment — just nightly lineup strategy.', gradient: 'from-blue-800/25 via-blue-900/15 to-transparent', sports: 'NBA' },
            ].map((mode) => (
              <Link key={mode.title} to="/signup" className="group relative rounded-2xl border border-text-primary/20 bg-bg-primary overflow-hidden p-6 hover:border-accent/50 transition-colors">
                <div className={`absolute inset-0 bg-gradient-to-br ${mode.gradient} pointer-events-none`} />
                <div className="relative">
                  <h3 className="font-display text-lg text-white mb-2">{mode.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed mb-3">{mode.desc}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">{mode.sports}</span>
                    <span className="text-xs text-accent font-semibold group-hover:translate-x-0.5 transition-transform">Start Playing →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Row 4: MLB DFS + Squares + Home Run Derby */}
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { title: 'MLB Daily Fantasy', desc: 'Set a new lineup every game day under a salary cap. Stack hitters, pick pitchers, chase the big night.', gradient: 'from-sky-800/25 via-sky-900/15 to-transparent', sports: 'MLB' },
              { title: 'Squares', desc: 'There is no better way to get a whole party of people engaged in the game than squares. Use squares for the Super Bowl or any game you\'re watching with friends!', gradient: 'from-purple-800/25 via-purple-900/15 to-transparent', sports: 'NFL · NBA · MLB' },
              { title: 'Home Run Derby', desc: 'Pick 3 hitters per day. Each player usable once per week. Most homers across the season wins.', gradient: 'from-amber-800/25 via-amber-900/15 to-transparent', sports: 'MLB' },
            ].map((mode) => (
              <Link key={mode.title} to="/signup" className="group relative rounded-2xl border border-text-primary/20 bg-bg-primary overflow-hidden p-6 hover:border-accent/50 transition-colors">
                <div className={`absolute inset-0 bg-gradient-to-br ${mode.gradient} pointer-events-none`} />
                <div className="relative">
                  <h3 className="font-display text-lg text-white mb-2">{mode.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed mb-3">{mode.desc}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">{mode.sports}</span>
                    <span className="text-xs text-accent font-semibold group-hover:translate-x-0.5 transition-transform">Start Playing →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Pick Winners + Props — live preview cards */}
        <div className="mb-16">
          <h2 className="font-display text-3xl text-center mb-3">Pick Winners. Build Your Record.</h2>
          <p className="text-text-muted text-center mb-8 max-w-lg mx-auto">Beyond leagues, every pick counts toward your global score. Climb from Rookie to GOAT.</p>

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {/* Game Pick Preview */}
            <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-accent mb-4">Game Picks</div>
              <div className="rounded-xl border border-text-primary/15 bg-black/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <img src="https://a.espncdn.com/i/teamlogos/mlb/500/laa.png" alt="" className="w-8 h-8 object-contain" />
                    <span className="font-semibold text-text-primary">Los Angeles Angels</span>
                  </div>
                  <span className="text-xs text-correct font-semibold">Risk 10 → Win 15</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img src="https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png" alt="" className="w-8 h-8 object-contain" />
                    <span className="font-semibold text-text-primary">New York Yankees</span>
                  </div>
                  <span className="text-xs text-accent font-semibold">Risk 10 → Win 6</span>
                </div>
                <div className="mt-3 pt-3 border-t border-text-primary/10 text-center">
                  <span className="text-xs text-text-muted">Underdogs pay more · Favorites pay less</span>
                </div>
              </div>
              <p className="text-sm text-text-secondary mt-4 leading-relaxed">Pick the winner of any game, any sport. Underdogs pay more. Every correct pick earns points — every miss costs 10.</p>
            </div>

            {/* Prop Pick Preview */}
            <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-accent mb-4">Player Props</div>
              <div className="rounded-xl border border-text-primary/15 bg-black/30 p-4">
                <div className="text-center mb-3">
                  <div className="font-semibold text-text-primary">Aaron Judge</div>
                  <div className="text-xs text-text-muted">NYY vs LAA · Total Bases</div>
                </div>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="flex-1 text-center py-2.5 rounded-lg border border-text-primary/20 bg-black/20">
                    <div className="text-xs text-text-muted mb-0.5">Over 1.5</div>
                    <div className="text-xs font-semibold text-text-primary">Risk 10 → Win 8</div>
                  </div>
                  <div className="text-xs text-text-muted font-bold">1.5</div>
                  <div className="flex-1 text-center py-2.5 rounded-lg border border-text-primary/20 bg-black/20">
                    <div className="text-xs text-text-muted mb-0.5">Under 1.5</div>
                    <div className="text-xs font-semibold text-text-primary">Risk 10 → Win 11</div>
                  </div>
                </div>
              </div>
              <p className="text-sm text-text-secondary mt-4 leading-relaxed">Predict player performances — points, rebounds, strikeouts, home runs. New props drop daily for every sport in season.</p>
            </div>
          </div>

          {/* Scoring explainer */}
          <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
            <div className="rounded-xl border border-text-primary/15 bg-bg-primary p-4 text-center">
              <div className="font-display text-2xl text-correct mb-1">+20</div>
              <div className="text-text-muted text-xs">Underdog win</div>
            </div>
            <div className="rounded-xl border border-text-primary/15 bg-bg-primary p-4 text-center">
              <div className="font-display text-2xl text-accent mb-1">+4</div>
              <div className="text-text-muted text-xs">Favorite win</div>
            </div>
            <div className="rounded-xl border border-text-primary/15 bg-bg-primary p-4 text-center">
              <div className="font-display text-2xl text-incorrect mb-1">-10</div>
              <div className="text-text-muted text-xs">Wrong pick</div>
            </div>
          </div>
        </div>

        {/* Beyond the Games — Hub + Headlines */}
        <div className="mb-16">
          <h2 className="font-display text-3xl text-center mb-3">More Than Just Leagues</h2>
          <p className="text-text-muted text-center mb-8 max-w-lg mx-auto">A full sports community with a social feed, weekly recaps, and real competition.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-accent mb-3">The Hub</div>
              <h3 className="font-display text-lg text-white mb-2">Social Feed</h3>
              <p className="text-sm text-text-secondary leading-relaxed">Share posts, predictions, and polls. React to plays, see what the community is picking. Your own sports social network.</p>
            </div>
            <div className="rounded-2xl border border-text-primary/20 bg-bg-primary p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-accent mb-3">Headlines</div>
              <h3 className="font-display text-lg text-white mb-2">Weekly Recaps</h3>
              <p className="text-sm text-text-secondary leading-relaxed">AI-powered weekly recaps highlighting top performers, biggest upsets, and who's climbing the leaderboard.</p>
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
            { value: '11', label: 'League Formats' },
            { value: '7+', label: 'Sports Covered' },
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
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl border-2 p-4 text-center ${tier.color} bg-bg-card ${isAuthenticated ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-transform' : ''}`}
              onClick={isAuthenticated ? () => setSelectedTier(tier) : undefined}
            >
              <div className="font-display text-lg mb-1">{tier.name}</div>
              <div className="text-xs opacity-70 mb-2">{tier.points} pts</div>
              <div className="text-xs text-text-muted">{tier.desc}</div>
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
