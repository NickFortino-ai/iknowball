import { Link } from 'react-router-dom'
import { useProfile, useSportStats } from '../hooks/useProfile'
import { usePickHistory } from '../hooks/usePicks'
import { getTier, getNextTier } from '../lib/scoring'
import TierBadge from '../components/ui/TierBadge'
import LoadingSpinner from '../components/ui/LoadingSpinner'

function StatusCard({ profile }) {
  const tier = getTier(profile.total_points)
  const nextTier = getNextTier(profile.total_points)
  const progress = nextTier
    ? ((Math.max(0, profile.total_points) - tier.minPoints) / (nextTier.minPoints - tier.minPoints)) * 100
    : 100

  return (
    <div className="bg-bg-card rounded-2xl border border-border p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-xl">{profile.display_name || profile.username}</h2>
          <p className="text-text-muted text-sm">@{profile.username}</p>
        </div>
        <TierBadge tier={tier.name} size="md" />
      </div>

      <div className="text-center mb-4">
        <div className="font-display text-4xl text-accent">{Math.max(0, profile.total_points)}</div>
        <div className="text-text-muted text-sm">Total Points</div>
      </div>

      {nextTier && (
        <div>
          <div className="flex justify-between text-xs text-text-muted mb-1">
            <span>{tier.name}</span>
            <span>{nextTier.name} — {nextTier.minPoints} pts</span>
          </div>
          <div className="w-full h-2 bg-bg-primary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function BioCard({ bio }) {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs text-text-muted uppercase tracking-wider">Bio</h2>
        <Link to="/settings" className="text-xs text-accent hover:underline">Edit in Settings</Link>
      </div>
      <p className="text-text-secondary text-sm">
        {bio || 'No bio yet — add one in Settings'}
      </p>
    </div>
  )
}

function SportCard({ stat }) {
  const winRate = stat.total_picks > 0
    ? ((stat.correct_picks / stat.total_picks) * 100).toFixed(0)
    : 0

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-display text-sm">{stat.sports?.name || 'Unknown'}</span>
        <span className="text-accent font-semibold">{stat.total_points} pts</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <div className="font-semibold text-text-primary">{stat.total_picks}</div>
          <div className="text-text-muted">Picks</div>
        </div>
        <div>
          <div className="font-semibold text-correct">{stat.correct_picks}</div>
          <div className="text-text-muted">Wins</div>
        </div>
        <div>
          <div className="font-semibold text-text-primary">{winRate}%</div>
          <div className="text-text-muted">Win %</div>
        </div>
        <div>
          <div className="font-semibold text-accent">{stat.best_streak}</div>
          <div className="text-text-muted">Best Run</div>
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: sportStats, isLoading: statsLoading } = useSportStats()
  const { data: recentPicks, isLoading: picksLoading } = usePickHistory()

  if (profileLoading) return <LoadingSpinner />
  if (!profile) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Profile</h1>

      <StatusCard profile={profile} />

      <BioCard bio={profile.bio} />

      {!statsLoading && sportStats?.length > 0 && (
        <div className="mb-6">
          <h2 className="font-display text-lg text-text-secondary mb-3">Sport Breakdown</h2>
          <div className="space-y-3">
            {sportStats.map((stat) => (
              <SportCard key={stat.id} stat={stat} />
            ))}
          </div>
        </div>
      )}

      {!picksLoading && recentPicks?.length > 0 && (
        <div>
          <h2 className="font-display text-lg text-text-secondary mb-3">Recent Picks</h2>
          <div className="space-y-2">
            {recentPicks.slice(0, 10).map((pick) => (
              <div key={pick.id} className="bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {pick.games?.away_team} @ {pick.games?.home_team}
                  </div>
                  <div className="text-xs text-text-muted">
                    Picked: {pick.picked_team === 'home' ? pick.games?.home_team : pick.games?.away_team}
                  </div>
                </div>
                <div className={`font-semibold text-sm ${
                  pick.points_earned > 0 ? 'text-correct' : pick.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
                }`}>
                  {pick.points_earned > 0 ? '+' : ''}{pick.points_earned ?? 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
