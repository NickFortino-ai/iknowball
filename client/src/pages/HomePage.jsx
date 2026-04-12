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
    '/backdrops/nfl-sofi.webp',
    '/backdrops/mlb-fenway.webp',
    '/backdrops/nba-intuit-dome.webp',
    '/backdrops/nfl-arrowhead.webp',
    '/backdrops/mlb-dodger.webp',
    '/backdrops/nba-little-caesars.webp',
    '/backdrops/nfl-atandt.webp',
    '/backdrops/mlb-globe-life-field.webp',
    '/backdrops/nba-fiserv.webp',
    '/backdrops/nfl-mercedes-benz.webp',
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
                Start Picking
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

      {/* How Scoring Works — logged-out only */}
      {!isAuthenticated && (
        <div className="mb-16">
          <h2 className="font-display text-2xl text-center mb-8">How Scoring Works</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-bg-card rounded-2xl border border-border p-6 text-center">
              <div className="font-display text-3xl text-correct mb-2">+20</div>
              <div className="text-text-secondary text-sm">Pick an underdog and win big — risk 10, win 20</div>
            </div>
            <div className="bg-bg-card rounded-2xl border border-border p-6 text-center">
              <div className="font-display text-3xl text-accent mb-2">+4</div>
              <div className="text-text-secondary text-sm">Pick a favorite for a safe gain — risk 10, win 4</div>
            </div>
            <div className="bg-bg-card rounded-2xl border border-border p-6 text-center">
              <div className="font-display text-3xl text-incorrect mb-2">-10</div>
              <div className="text-text-secondary text-sm">Wrong pick? You lose 10 points every time</div>
            </div>
          </div>
        </div>
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
