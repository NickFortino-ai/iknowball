import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const tiers = [
  { name: 'Rookie', points: '0+', color: 'border-tier-rookie text-tier-rookie', desc: 'Just getting started' },
  { name: 'Starter', points: '100+', color: 'border-tier-starter text-tier-starter', desc: 'Proving yourself' },
  { name: 'All-Star', points: '500+', color: 'border-tier-allstar text-tier-allstar', desc: 'Making waves' },
  { name: 'MVP', points: '2,000+', color: 'border-tier-mvp text-tier-mvp', desc: 'Elite knowledge' },
  { name: 'GOAT', points: '10,000+', color: 'border-tier-goat text-tier-goat', desc: 'Undisputed' },
]

export default function HomePage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-16">
        <h1 className="font-display text-5xl sm:text-7xl text-accent mb-4 tracking-tight">
          I KNOW BALL
        </h1>
        <p className="text-text-secondary text-lg sm:text-xl max-w-lg mx-auto mb-8">
          Pick winners. Earn points based on Vegas odds. Climb the ranks. Prove you know ball.
        </p>
        {!isAuthenticated ? (
          <div className="flex items-center justify-center gap-3">
            <Link to="/signup" className="bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors">
              Start Picking
            </Link>
            <Link to="/login" className="border border-border hover:border-border-hover text-text-secondary hover:text-text-primary px-8 py-3 rounded-xl text-lg transition-colors">
              Sign In
            </Link>
          </div>
        ) : (
          <Link to="/picks" className="bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors inline-block">
            Make Your Picks
          </Link>
        )}
      </div>

      {/* How Scoring Works */}
      <div className="mb-16">
        <h2 className="font-display text-2xl text-center mb-8">How Scoring Works</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-bg-card rounded-2xl border border-border p-6 text-center">
            <div className="font-display text-3xl text-accent mb-2">10</div>
            <div className="text-text-secondary text-sm">Risk points per pick — same every time</div>
          </div>
          <div className="bg-bg-card rounded-2xl border border-border p-6 text-center">
            <div className="font-display text-3xl text-correct mb-2">+$$</div>
            <div className="text-text-secondary text-sm">Win more for picking underdogs, less for favorites</div>
          </div>
          <div className="bg-bg-card rounded-2xl border border-border p-6 text-center">
            <div className="font-display text-3xl text-incorrect mb-2">-10</div>
            <div className="text-text-secondary text-sm">Lose your 10 risk points when you're wrong</div>
          </div>
        </div>
      </div>

      {/* Tier Breakdown */}
      <div>
        <h2 className="font-display text-2xl text-center mb-8">Status Tiers</h2>
        <div className="grid sm:grid-cols-5 gap-3">
          {tiers.map((tier) => (
            <div key={tier.name} className={`rounded-xl border-2 p-4 text-center ${tier.color} bg-bg-card`}>
              <div className="font-display text-lg mb-1">{tier.name}</div>
              <div className="text-xs opacity-70 mb-2">{tier.points} pts</div>
              <div className="text-xs text-text-muted">{tier.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
