import { useState } from 'react'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useAuth } from '../hooks/useAuth'
import TierBadge from '../components/ui/TierBadge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import UserProfileModal from '../components/profile/UserProfileModal'

const tabs = [
  { label: 'Global', scope: 'global', sport: null },
  { label: 'NBA', scope: 'sport', sport: 'basketball_nba' },
  { label: 'MLB', scope: 'sport', sport: 'baseball_mlb' },
  { label: 'NFL', scope: 'sport', sport: 'americanfootball_nfl' },
  { label: 'NCAAB', scope: 'sport', sport: 'basketball_ncaab' },
  { label: 'NCAAF', scope: 'sport', sport: 'americanfootball_ncaaf' },
]

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const tab = tabs[activeTab]
  const { data: leaders, isLoading } = useLeaderboard(tab.scope, tab.sport)
  const { profile } = useAuth()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Leaderboard</h1>

      <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-hide -mx-4 px-4">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActiveTab(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !leaders?.length ? (
        <EmptyState title="No rankings yet" message="Be the first to make picks!" />
      ) : (
        <div className="bg-bg-card rounded-2xl border border-border overflow-hidden">
          <div className="grid grid-cols-[3rem_1fr_auto_auto] gap-2 md:gap-4 px-4 py-3 border-b border-border text-xs text-text-muted uppercase tracking-wider">
            <span>#</span>
            <span>Player</span>
            <span>Tier</span>
            <span className="text-right">Points</span>
          </div>

          {leaders.map((user) => {
            const isMe = user.id === profile?.id
            return (
              <div
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                className={`grid grid-cols-[3rem_1fr_auto_auto] gap-2 md:gap-4 px-4 py-3 items-center border-b border-border last:border-b-0 cursor-pointer hover:bg-bg-card-hover transition-colors ${
                  isMe ? 'bg-accent/5' : ''
                }`}
              >
                <span className={`font-display text-lg ${user.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>
                  {user.rank}
                </span>
                <div className="min-w-0">
                  <div className={`font-semibold truncate ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                    {user.display_name || user.username}
                  </div>
                  <div className="text-xs text-text-muted">@{user.username}</div>
                </div>
                <TierBadge tier={user.tier} size="xs" />
                <span className="font-display text-lg text-right">
                  {tab.scope === 'sport' ? (user.sport_points ?? 0) : (user.total_points ?? 0)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <UserProfileModal
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  )
}
