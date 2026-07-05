import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLeaderboard, useUserRankOnLeaderboard } from '../hooks/useLeaderboard'
import { useAuth } from '../hooks/useAuth'
import { useAppConfig } from '../hooks/useAppConfig'
import TierBadge from '../components/ui/TierBadge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import UserProfileModal from '../components/profile/UserProfileModal'
import Avatar from '../components/ui/Avatar'
import LeaderboardSearch from '../components/leaderboard/LeaderboardSearch'

function LeaguesScoringModal({ open, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 rounded-2xl shadow-lg max-w-md w-full p-6"
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
          {/* Top Half % column is desktop-only (hidden md:inline on the table),
              so only explain it at md+ to match what the user can actually see. */}
          <p className="hidden md:block text-text-muted text-xs pt-1">Top Half % shows how often you finish with positive points.</p>
          <p className="text-text-muted text-xs pt-1 md:pt-0">Wins count league and survivor victories.</p>
        </div>
      </div>
    </div>
  )
}

// Renders the result of a leaderboard search — a banner with the
// searched user's name + an X to clear, followed by a single row
// showing their rank on the current tab. Styled to match the normal
// leaderboard row so the user instantly recognizes the format.
function SearchResultView({
  searchedUser, rank, loading, error, isLeaguesTab, scope, currentUserId, onClear, onRowClick,
}) {
  const displayName = searchedUser.display_name || searchedUser.username
  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-sm text-text-muted">
          Showing rank for <span className="font-semibold text-text-primary">{displayName}</span>
        </p>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          Clear
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {isLeaguesTab ? (
        <div className="bg-bg-primary rounded-2xl border border-text-primary/20 px-4 py-6 text-center text-sm text-text-muted">
          Leaderboard search isn't available on the Leagues tab yet.
        </div>
      ) : loading ? (
        <LoadingSpinner />
      ) : error || !rank ? (
        <div className="bg-bg-primary rounded-2xl border border-text-primary/20 px-4 py-6 text-center text-sm text-text-muted">
          {displayName} hasn't appeared on this leaderboard yet.
        </div>
      ) : (
        <div className="bg-bg-primary rounded-2xl border border-text-primary/20 overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-2 md:gap-4 px-4 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
            <span>#</span>
            <span>Player</span>
            <span>Tier</span>
            <span className="text-right">Points</span>
          </div>
          <div
            onClick={() => onRowClick(rank.id)}
            className={`grid grid-cols-[2rem_1fr_auto_auto] gap-2 md:gap-4 px-4 py-3 items-center cursor-pointer hover:bg-text-primary/5 transition-colors ${
              rank.id === currentUserId ? 'bg-accent/5' : ''
            }`}
          >
            <span className={`font-display text-lg ${rank.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>
              {rank.rank}
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <Avatar user={rank} size="md" />
              <div className="min-w-0">
                <div className={`font-semibold truncate ${rank.id === currentUserId ? 'text-accent' : 'text-text-primary'}`}>
                  {rank.display_name || rank.username}
                </div>
                <div className="text-xs text-text-muted">@{rank.username}</div>
              </div>
            </div>
            <TierBadge tier={rank.tier} size="xs" />
            <span className="font-display text-lg text-right">
              {scope === 'sport' ? (rank.sport_points ?? 0) : scope === 'picks' ? (rank.pick_points ?? 0) : scope === 'props' ? (rank.prop_points ?? 0) : scope === 'parlays' ? (rank.parlay_points ?? 0) : (rank.total_points ?? 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const DEFAULT_TABS = [
  { label: 'Global', scope: 'global', sport: null },
  { label: 'NBA', scope: 'sport', sport: 'basketball_nba' },
  { label: 'NCAAB', scope: 'sport', sport: 'basketball_ncaab' },
  { label: 'WNCAAB', scope: 'sport', sport: 'basketball_wncaab' },
  { label: 'MLB', scope: 'sport', sport: 'baseball_mlb' },
  { label: 'NHL', scope: 'sport', sport: 'icehockey_nhl' },
  { label: 'MLS', scope: 'sport', sport: 'soccer_usa_mls' },
  { label: 'WC', scope: 'sport', sport: 'soccer_world_cup' },
  { label: 'Picks', scope: 'picks', sport: null },
  { label: 'Props', scope: 'props', sport: null },
  { label: 'Parlays', scope: 'parlays', sport: null },
  { label: 'Leagues', scope: 'leagues', sport: null },
  { label: 'NFL', scope: 'sport', sport: 'americanfootball_nfl' },
  { label: 'NCAAF', scope: 'sport', sport: 'americanfootball_ncaaf' },
  { label: 'UFL', scope: 'sport', sport: 'americanfootball_ufl' },
  { label: 'WNBA', scope: 'sport', sport: 'basketball_wnba' },
]

function getOrderStorageKey(userId) {
  return userId ? `leaderboard_tab_order_v1:${userId}` : 'leaderboard_tab_order_v1'
}

// Map a list of saved labels back to the corresponding DEFAULT_TABS
// entries, appending any new tabs added since the user last reordered.
function labelsToTabs(labels) {
  if (!Array.isArray(labels)) return DEFAULT_TABS
  const ordered = []
  for (const label of labels) {
    const t = DEFAULT_TABS.find((d) => d.label === label)
    if (t && !ordered.includes(t)) ordered.push(t)
  }
  for (const t of DEFAULT_TABS) {
    if (!ordered.includes(t)) ordered.push(t)
  }
  return ordered
}

// Initial load priority:
//   1. User's server-saved order (profile.leaderboard_tab_order)
//   2. User's localStorage saved order
//   3. Admin-set default from app_config (leaderboard_default_tab_order)
//   4. Hardcoded DEFAULT_TABS as last resort
// Once the user reorders for the first time, their personal order wins
// every subsequent render — the admin default is only a starting point.
function loadTabOrder(userId, serverOrder, adminDefaultOrder) {
  if (Array.isArray(serverOrder) && serverOrder.length) return labelsToTabs(serverOrder)
  try {
    const saved = localStorage.getItem(getOrderStorageKey(userId))
    if (saved) return labelsToTabs(JSON.parse(saved))
  } catch {
    // fall through
  }
  if (Array.isArray(adminDefaultOrder) && adminDefaultOrder.length) {
    return labelsToTabs(adminDefaultOrder)
  }
  return DEFAULT_TABS
}

function saveTabOrder(userId, tabs) {
  const labels = tabs.map((t) => t.label)
  try {
    localStorage.setItem(getOrderStorageKey(userId), JSON.stringify(labels))
  } catch {
    // localStorage might be unavailable (private mode, etc.) — silently ignore.
  }
  // Persist server-side so the order syncs across devices. Fire and forget
  // — local cache + localStorage already gave the user instant feedback;
  // a network blip here just means the next device load reads the stale
  // server value (which is fine, they'll re-sync on next reorder).
  api.patch('/users/me', { leaderboard_tab_order: labels }).catch(() => {})
}

// Reorder via chevron buttons rather than drag. The previous pointer-drag
// implementation was unpredictable on mobile (overflow-x-auto hijack,
// flex-wrap multi-row complications) and produced jumpy swaps. Tap-to-
// move is boring and reliable: each tab in edit mode shows ◀ ▶ buttons
// that swap it one slot in either direction. Active state and label
// click still work in normal mode.
function ReorderableTabs({ tabs, setTabs, activeLabel, setActiveLabel, editMode, onToggleEdit, onScoringInfoClick, userId, scrollRef }) {
  function moveTab(label, direction) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.label === label)
      if (idx < 0) return prev
      const target = direction === 'left' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(idx, 1)
      next.splice(target, 0, moved)
      saveTabOrder(userId, next)
      return next
    })
  }

  return (
    <div
      className={`flex items-center gap-2 pb-2 mb-6 scrollbar-hide -mx-4 px-4 ${editMode ? 'flex-wrap' : 'overflow-x-auto'}`}
      ref={scrollRef}
    >
      <button
        type="button"
        onClick={onToggleEdit}
        aria-label={editMode ? 'Done reordering' : 'Reorder tabs'}
        className={`flex-shrink-0 w-6 h-9 flex items-center justify-center rounded-md transition-colors ${
          editMode ? 'bg-accent/20 text-accent' : 'text-text-muted/60 hover:text-text-primary'
        }`}
      >
        <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden>
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
        </svg>
      </button>
      {tabs.map((t, i) => {
        const isActive = activeLabel === t.label
        const canMoveLeft = i > 0
        const canMoveRight = i < tabs.length - 1
        return (
          <div
            key={t.label}
            onClick={() => { if (!editMode) setActiveLabel(t.label) }}
            className={`flex-shrink-0 px-1 py-1 rounded-lg flex items-center select-none ${
              isActive && !editMode
                ? 'bg-accent text-white'
                : 'bg-bg-primary border border-text-primary/20 text-text-primary'
            } ${editMode ? '' : 'cursor-pointer hover:border-text-primary/40 transition-colors'}`}
          >
            {/* Left chevron — edit mode only */}
            {editMode && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); moveTab(t.label, 'left') }}
                disabled={!canMoveLeft}
                aria-label={`Move ${t.label} left`}
                className="px-1.5 py-1 text-text-muted hover:text-text-primary disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}

            {/* Label — clickable in normal mode for tab activation */}
            <span className={`text-sm font-semibold ${editMode ? 'px-1' : 'px-3'} py-1 inline-flex items-center gap-1`}>
              {t.label}
              {t.scope === 'leagues' && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onScoringInfoClick() }}
                  className="inline-flex items-center ml-0.5 opacity-70 hover:opacity-100 transition-opacity"
                  aria-label="Scoring info"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </button>
              )}
            </span>

            {/* Right chevron — edit mode only */}
            {editMode && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); moveTab(t.label, 'right') }}
                disabled={!canMoveRight}
                aria-label={`Move ${t.label} right`}
                className="px-1.5 py-1 text-text-muted hover:text-text-primary disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function LeaderboardPage() {
  const { profile } = useAuth()
  const userId = profile?.id
  const serverOrder = profile?.leaderboard_tab_order
  const { data: appCfg } = useAppConfig()
  const adminDefaultOrder = appCfg?.leaderboard_default_tab_order
  const [tabs, setTabs] = useState(() => loadTabOrder(userId, serverOrder, adminDefaultOrder))
  const [activeLabel, setActiveLabel] = useState(tabs[0]?.label || 'Global')
  const [editMode, setEditMode] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [scoringModalOpen, setScoringModalOpen] = useState(false)
  const [searchedUser, setSearchedUser] = useState(null)
  const scrollRef = useRef(null)

  // Reload order when userId arrives, when server-side order changes
  // (user reordered on another device), or when admin updates the default.
  useEffect(() => {
    setTabs(loadTabOrder(userId, serverOrder, adminDefaultOrder))
  }, [userId, JSON.stringify(serverOrder), JSON.stringify(adminDefaultOrder)])

  const tab = useMemo(() => tabs.find((t) => t.label === activeLabel) || tabs[0], [tabs, activeLabel])
  const isLeaguesTab = tab.scope === 'leagues'
  const { data: leaders, isLoading, isError, refetch } = useLeaderboard(isLeaguesTab ? null : tab.scope, tab.sport)
  const { data: leagueLeaders, isLoading: leaguesLoading } = useQuery({
    queryKey: ['leaderboard', 'leagues'],
    queryFn: () => api.get('/leaderboard/leagues'),
    enabled: isLeaguesTab,
  })
  // Fetch rank for the searched user on whichever tab is active. Skipped
  // for the Leagues tab for now (different data shape — can add later).
  const rankScope = isLeaguesTab ? null : tab.scope
  const { data: searchedRank, isLoading: rankLoading, isError: rankError } = useUserRankOnLeaderboard(
    searchedUser?.id && !isLeaguesTab ? searchedUser.id : null,
    rankScope,
    tab.sport
  )

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-32">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="font-display text-3xl">Leaderboard</h1>
        <div className="flex-1" />
        <LeaderboardSearch onSelect={setSearchedUser} />
      </div>

      <ReorderableTabs
        tabs={tabs}
        setTabs={setTabs}
        activeLabel={activeLabel}
        setActiveLabel={setActiveLabel}
        editMode={editMode}
        onToggleEdit={() => setEditMode((v) => !v)}
        onScoringInfoClick={() => setScoringModalOpen(true)}
        userId={userId}
        scrollRef={scrollRef}
      />
      {editMode && (
        <p className="text-[10px] text-text-muted -mt-4 mb-4 px-1">Drag tabs to reorder. Tap the dots again when finished.</p>
      )}

      {tab.scope === 'sport' && (
        <p className="text-xs text-text-muted -mt-4 mb-4">Straight picks only</p>
      )}
      {tab.scope === 'picks' && (
        <p className="text-xs text-text-primary -mt-4 mb-4">Straight picks across all sports</p>
      )}

      {searchedUser ? (
        <SearchResultView
          searchedUser={searchedUser}
          rank={searchedRank}
          loading={rankLoading}
          error={rankError}
          isLeaguesTab={isLeaguesTab}
          scope={tab.scope}
          currentUserId={profile?.id}
          onClear={() => setSearchedUser(null)}
          onRowClick={(id) => setSelectedUserId(id)}
        />
      ) : isLeaguesTab ? (
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
                  {tab.scope === 'sport' ? (user.sport_points ?? 0) : tab.scope === 'picks' ? (user.pick_points ?? 0) : tab.scope === 'props' ? (user.prop_points ?? 0) : tab.scope === 'parlays' ? (user.parlay_points ?? 0) : (user.total_points ?? 0)}
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
