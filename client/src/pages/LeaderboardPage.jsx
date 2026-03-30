import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useAuth } from '../hooks/useAuth'
import TierBadge from '../components/ui/TierBadge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import UserProfileModal from '../components/profile/UserProfileModal'
import Avatar from '../components/ui/Avatar'

function LeaguesScoringModal({ open, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border rounded-2xl shadow-lg max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h2 className="font-display text-xl mb-4">League Points Scoring</h2>
        <div className="text-sm text-text-secondary leading-relaxed space-y-3">
          <p>League Points are earned from league finishes and wins across all league types:</p>
          <ul className="list-disc list-inside space-y-1.5 text-text-secondary">
            <li><span className="text-text-primary font-semibold">League Win</span> — bonus points for finishing 1st</li>
            <li><span className="text-text-primary font-semibold">League Finish</span> — points based on final standing</li>
            <li><span className="text-text-primary font-semibold">Bracket Finish</span> — points from bracket tournaments</li>
            <li><span className="text-text-primary font-semibold">Survivor Win</span> — bonus for winning a survivor league</li>
            <li><span className="text-text-primary font-semibold">Pick'em Earned</span> — points earned in pick'em leagues</li>
          </ul>
          <p className="text-text-muted text-xs pt-1">Top Half % shows how often you finish with positive points. Wins count league and survivor victories.</p>
        </div>
      </div>
    </div>
  )
}

const tabs = [
  { label: 'Global', scope: 'global', sport: null },
  { label: 'NBA', scope: 'sport', sport: 'basketball_nba' },
  { label: 'NCAAB', scope: 'sport', sport: 'basketball_ncaab' },
  { label: 'WNCAAB', scope: 'sport', sport: 'basketball_wncaab' },
  { label: 'MLB', scope: 'sport', sport: 'baseball_mlb' },
  { label: 'NHL', scope: 'sport', sport: 'icehockey_nhl' },
  { label: 'MLS', scope: 'sport', sport: 'soccer_usa_mls' },
  { label: 'Props', scope: 'props', sport: null },
  { label: 'Parlays', scope: 'parlays', sport: null },
  { label: 'Leagues', scope: 'leagues', sport: null },
  { label: 'NFL', scope: 'sport', sport: 'americanfootball_nfl' },
  { label: 'NCAAF', scope: 'sport', sport: 'americanfootball_ncaaf' },
  { label: 'WNBA', scope: 'sport', sport: 'basketball_wnba' },
]

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [scoringModalOpen, setScoringModalOpen] = useState(false)
  const tab = tabs[activeTab]
  const isLeaguesTab = tab.scope === 'leagues'
  const { data: leaders, isLoading, isError, refetch } = useLeaderboard(isLeaguesTab ? null : tab.scope, tab.sport)
  const { data: leagueLeaders, isLoading: leaguesLoading } = useQuery({
    queryKey: ['leaderboard', 'leagues'],
    queryFn: () => api.get('/leaderboard/leagues'),
    enabled: isLeaguesTab,
  })
  const { profile } = useAuth()

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-32">
      <h1 className="font-display text-3xl mb-6">Leaderboard</h1>

      <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-hide -mx-4 px-4">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActiveTab(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 ${
              activeTab === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {t.label}
            {t.scope === 'leagues' && (
              <span
                onClick={(e) => { e.stopPropagation(); setScoringModalOpen(true) }}
                className="inline-flex items-center ml-0.5 opacity-70 hover:opacity-100 transition-opacity"
                aria-label="Scoring info"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </span>
            )}
          </button>
        ))}
      </div>

      {tab.scope === 'sport' && (
        <p className="text-xs text-text-muted -mt-4 mb-4">Straight picks only</p>
      )}

      {isLeaguesTab ? (
        leaguesLoading ? (
          <LoadingSpinner />
        ) : !leagueLeaders?.length ? (
          <EmptyState title="No league rankings yet" message="Join a league and start competing!" />
        ) : (
          <div className="bg-bg-primary rounded-2xl border border-text-primary/20 overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_3rem_4rem] md:grid-cols-[2.5rem_1fr_3.5rem_4rem_3rem_5rem] gap-2 px-4 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="hidden md:inline text-right">Leagues</span>
              <span className="hidden md:inline text-right">Top Half</span>
              <span className="text-right">Wins</span>
              <span className="text-right">Points</span>
            </div>

            {leagueLeaders.map((user) => {
              const isMe = user.id === profile?.id
              return (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full grid grid-cols-[2.5rem_1fr_3rem_4rem] md:grid-cols-[2.5rem_1fr_3.5rem_4rem_3rem_5rem] gap-2 px-4 py-3.5 items-center border-b border-text-primary/10 last:border-b-0 cursor-pointer hover:bg-text-primary/5 transition-colors text-left ${
                    isMe ? 'bg-accent/5' : ''
                  }`}
                >
                  <span className={`font-display text-xl ${user.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>
                    {user.rank}
                  </span>
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar user={user} size="lg" />
                    <div className="min-w-0">
                      <div className={`font-bold text-base truncate ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                        {user.display_name || user.username}
                      </div>
                      <div className="text-xs text-text-muted">@{user.username}</div>
                    </div>
                  </div>
                  <span className="hidden md:inline text-sm text-text-secondary text-right">{user.leagues_played}</span>
                  <span className="hidden md:inline text-sm text-text-secondary text-right">{user.top_half_pct}%</span>
                  <span className="text-sm text-text-secondary text-right">{user.wins}</span>
                  <span className="font-display text-xl text-white text-right">{user.league_points}</span>
                </button>
              )
            })}
          </div>
        )
      ) : isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState title="Failed to load rankings" message="Check your connection and try again." onRetry={refetch} />
      ) : !leaders?.length ? (
        <EmptyState title="No rankings yet" message="Be the first to make picks!" />
      ) : (
        <div data-onboarding="leaderboard" className="bg-bg-primary rounded-2xl border border-text-primary/20 overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-2 md:gap-4 px-4 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
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
                className={`grid grid-cols-[2rem_1fr_auto_auto] gap-2 md:gap-4 px-4 py-3 items-center border-b border-text-primary/10 last:border-b-0 cursor-pointer hover:bg-text-primary/5 transition-colors ${
                  isMe ? 'bg-accent/5' : ''
                }`}
              >
                <span className={`font-display text-lg ${user.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>
                  {user.rank}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={user} size="md" />
                  <div className="min-w-0">
                    <div className={`font-semibold truncate ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                      {user.display_name || user.username}
                    </div>
                    <div className="text-xs text-text-muted">@{user.username}</div>
                  </div>
                </div>
                <TierBadge tier={user.tier} size="xs" />
                <span className="font-display text-lg text-right">
                  {tab.scope === 'sport' ? (user.sport_points ?? 0) : tab.scope === 'props' ? (user.prop_points ?? 0) : tab.scope === 'parlays' ? (user.parlay_points ?? 0) : (user.total_points ?? 0)}
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
      <LeaguesScoringModal open={scoringModalOpen} onClose={() => setScoringModalOpen(false)} />
    </div>
  )
}
