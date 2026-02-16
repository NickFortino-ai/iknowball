import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import InfoTooltip from '../components/ui/InfoTooltip'

const tiers = [
  { name: 'Lost', points: '<0', color: 'border-tier-lost text-tier-lost', desc: 'Gone negative' },
  { name: 'Rookie', points: '0+', color: 'border-tier-rookie text-tier-rookie', desc: 'Just getting started' },
  { name: 'Baller', points: '100+', color: 'border-tier-baller text-tier-baller', desc: 'Proving yourself' },
  { name: 'Elite', points: '500+', color: 'border-tier-elite text-tier-elite', desc: 'Making waves' },
  { name: 'Hall of Famer', points: '1,000+', color: 'border-tier-hof text-tier-hof', desc: 'Legendary status' },
  { name: 'GOAT', points: '3,000+', color: 'border-tier-goat text-tier-goat', desc: 'Undisputed' },
]

export default function HomePage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {/* Hero */}
      <div className="text-center mb-16">
        <h1 className="font-display text-5xl sm:text-7xl text-accent mb-4 tracking-tight">
          I KNOW BALL
          <InfoTooltip text="I KNOW BALL is a sports prediction social app. Every game has real Vegas odds that determine how many points you win or lose. All your picks are tracked and scored automatically. You can see your global overall rank and your rank for each sport. Compete with friends in leagues, climb the status tiers, and prove you actually know ball." />
        </h1>
        <p className="text-text-secondary text-lg sm:text-xl max-w-lg mx-auto mb-8">
          Pick winners. Earn points based on Vegas odds. Climb the ranks. Prove you know ball.
        </p>
        {!isAuthenticated ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/signup" className="w-full sm:w-auto text-center bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors">
              Start Picking
            </Link>
            <Link to="/login" className="w-full sm:w-auto text-center border border-border hover:border-border-hover text-text-secondary hover:text-text-primary px-8 py-3 rounded-xl text-lg transition-colors">
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

      {/* Tier Breakdown */}
      <div className="lg:-mx-24">
        <h2 className="font-display text-2xl text-center mb-8">
          Status Tiers
          <InfoTooltip text="Your status is based on your lifetime point total across all picks and all sports. Every correct pick earns points. Every wrong pick costs points. Climb from Rookie to GOAT." />
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
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
