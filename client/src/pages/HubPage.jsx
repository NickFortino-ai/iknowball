import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import {
  useConnections,
  usePendingConnectionRequests,
  useSendConnectionRequest,
  useAcceptConnectionRequest,
  useDeclineConnectionRequest,
  useRemoveConnection,
} from '../hooks/useConnections'
import { useSearchUsers } from '../hooks/useInvitations'
import { getTier } from '../lib/scoring'
import TierBadge from '../components/ui/TierBadge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import UserProfileModal from '../components/profile/UserProfileModal'
import { toast } from '../components/ui/Toast'
import InfoTooltip from '../components/ui/InfoTooltip'
import SocialLinks from '../components/ui/SocialLinks'
import ActivityFeed from '../components/feed/ActivityFeed'
import TeamFeed from '../components/feed/TeamFeed'
import { useTeamsForSport } from '../hooks/useHotTakes'
import ReceiptsTab from '../components/feed/ReceiptsTab'
import UserFeedTab from '../components/feed/UserFeedTab'
import NewsFeed from '../components/feed/NewsFeed'
import Avatar from '../components/ui/Avatar'
import { getBackdropUrl } from '../lib/backdropUrl'

function MyProfileBanner({ profile, onTap }) {
  const tier = getTier(profile.total_points)

  const hasBackdrop = !!profile.backdrop_image

  return (
    <div
      onClick={onTap}
      className={`relative bg-bg-primary border border-text-primary/20 rounded-2xl mb-6 cursor-pointer hover:bg-text-primary/5 transition-colors overflow-hidden lg:max-w-2xl lg:mx-auto ${hasBackdrop ? 'p-5 lg:py-8' : 'p-5'}`}
    >
      {hasBackdrop && (
        <>
          <img
            src={getBackdropUrl(profile.backdrop_image)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
            style={{ objectPosition: `center ${profile.backdrop_y ?? 50}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/70 via-bg-primary/40 to-bg-primary/70 pointer-events-none" />
        </>
      )}
      <div className="relative z-10 flex items-center gap-4">
        <Avatar user={profile} size="2xl" className="bg-accent/15 border border-accent/25" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl truncate">{profile.display_name || profile.username}</div>
          <div className="text-text-muted text-sm">@{profile.username}</div>
          <SocialLinks user={profile} />
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <TierBadge tier={tier.name} size="md" />
          <span className="text-white font-display text-lg">{profile.total_points} pts</span>
        </div>
      </div>
    </div>
  )
}

const SPORT_OPTIONS = [
  { key: 'basketball_nba', label: 'NBA' },
  { key: 'basketball_ncaab', label: 'NCAAB' },
  { key: 'basketball_wncaab', label: 'WNCAAB' },
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'baseball_mlb', label: 'MLB' },
  { key: 'icehockey_nhl', label: 'NHL' },
  { key: 'soccer_usa_mls', label: 'MLS' },
  { key: 'basketball_wnba', label: 'WNBA' },
  { key: 'americanfootball_ncaaf', label: 'NCAAF' },
]

function FilterPanel({ filterSport, filterTeam, filterTeamSearch, onSelectSport, onSelectTeam, onTeamSearchChange }) {
  const { data: teams } = useTeamsForSport(filterSport)
  const filteredTeams = (teams || []).filter((t) =>
    filterTeamSearch.length >= 2 && t.toLowerCase().includes(filterTeamSearch.toLowerCase())
  ).slice(0, 8)

  return (
    <div className="mt-2 bg-bg-card border border-border rounded-xl p-3">
      <div className="flex gap-1.5 flex-wrap mb-2">
        {SPORT_OPTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => onSelectSport(filterSport === s.key ? null : s.key)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              filterSport === s.key ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {filterSport && (
        <div className="relative">
          <input
            value={filterTeamSearch}
            onChange={(e) => onTeamSearchChange(e.target.value)}
            placeholder="Search team..."
            className="w-full bg-bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {filteredTeams.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredTeams.map((team) => (
                <button
                  key={team}
                  onClick={() => onSelectTeam(team)}
                  className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-bg-card-hover"
                >
                  {team}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const VALID_SCOPES = new Set(['squad', 'all', 'highlights', 'polls', 'predictions', 'receipts', 'user_feeds', 'news'])

export default function HubPage() {
  const { session } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [squadExpanded, setSquadExpanded] = useState(false)
  const [filterMode, setFilterMode] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filterSport, setFilterSport] = useState(null)
  const [filterTeam, setFilterTeam] = useState(null)
  const [filterTeamSearch, setFilterTeamSearch] = useState('')
  const [highlightsFilter, setHighlightsFilter] = useState('all')
  const hasManuallyToggled = useRef(false)

  // Read tab + scrollTo + team from query params
  const tabParam = searchParams.get('tab')
  const scrollToParam = searchParams.get('scrollTo')
  const teamParam = searchParams.get('team')
  const userParam = searchParams.get('user')
  const [feedScope, setFeedScope] = useState(
    tabParam && VALID_SCOPES.has(tabParam) ? tabParam : 'squad'
  )
  const [scrollToItem, setScrollToItem] = useState(scrollToParam || null)
  const [initialTeam, setInitialTeam] = useState(teamParam || null)
  const [initialFeedUserId, setInitialFeedUserId] = useState(userParam || null)

  // When query params change (e.g. notification deep-link), update state
  useEffect(() => {
    const tab = searchParams.get('tab')
    const scrollTo = searchParams.get('scrollTo')
    const team = searchParams.get('team')
    const user = searchParams.get('user')
    if (tab && VALID_SCOPES.has(tab)) {
      hasManuallyToggled.current = true
      setFeedScope(tab)
    }
    if (scrollTo) {
      setScrollToItem(scrollTo)
    }
    if (team) {
      setInitialTeam(team)
    }
    if (user) {
      setInitialFeedUserId(user)
    }
    // Clear query params after consumption
    if (tab || scrollTo || team || user) {
      const timer = setTimeout(() => {
        setSearchParams({}, { replace: true })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  const { data: connections, isLoading: connectionsLoading } = useConnections()
  const { data: pending } = usePendingConnectionRequests()
  const { data: searchResults } = useSearchUsers(searchQuery)
  const sendRequest = useSendConnectionRequest()
  const acceptRequest = useAcceptConnectionRequest()
  const declineRequest = useDeclineConnectionRequest()
  const removeConnection = useRemoveConnection()

  const connectedUserIds = new Set((connections || []).map((c) => c.user_id))

  // Default to 'all' feed when user has no connections (but don't override query param tab)
  useEffect(() => {
    if (!connectionsLoading && !hasManuallyToggled.current) {
      setFeedScope(connections?.length ? 'squad' : 'all')
    }
  }, [connections, connectionsLoading])

  function handleScopeToggle(scope) {
    hasManuallyToggled.current = true
    setFeedScope(scope)
    if (scope !== 'highlights') setHighlightsFilter('all')
    if (scope !== 'team_feed') setInitialTeam(null)
  }

  async function handleSendRequest(username) {
    try {
      await sendRequest.mutateAsync(username)
      toast(`Connection request sent to @${username}`, 'success')
      setSearchQuery('')
    } catch (err) {
      toast(err.message || 'Failed to send request', 'error')
    }
  }

  async function handleAccept(connectionId) {
    try {
      await acceptRequest.mutateAsync(connectionId)
      toast('Connection accepted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to accept', 'error')
    }
  }

  async function handleDecline(connectionId) {
    try {
      await declineRequest.mutateAsync(connectionId)
      toast('Request declined', 'info')
    } catch (err) {
      toast(err.message || 'Failed to decline', 'error')
    }
  }

  async function handleRemoveConnection(conn) {
    try {
      await removeConnection.mutateAsync(conn.connection_id)
      toast(`Removed @${conn.username} from squad`, 'info')
    } catch (err) {
      toast(err.message || 'Failed to remove', 'error')
    }
  }

  function toggleFilterMode() {
    if (!filterMode) setSquadExpanded(true)
    setFilterMode(!filterMode)
  }

  if (profileLoading || connectionsLoading) {
    return (
      <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl mb-6">Hub</h1>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 pt-6 pb-32">
      <h1 className="font-display text-3xl mb-6">Hub</h1>

      {/* My Profile */}
      {profile && (
        <MyProfileBanner
          profile={profile}
          onTap={() => setSelectedUserId(session?.user?.id)}
        />
      )}

      {/* Pending Requests */}
      {pending?.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">Pending Requests</h2>
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={req.requester} size="lg" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {req.requester?.display_name || req.requester?.username}
                    </div>
                    <div className="text-xs text-text-muted">@{req.requester?.username}</div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-3">
                  <button
                    onClick={() => handleAccept(req.id)}
                    disabled={acceptRequest.isPending}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecline(req.id)}
                    disabled={declineRequest.isPending}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-bg-secondary text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Connection */}
      <div className="mb-6">
        <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">Add Connection</h2>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username..."
            className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />

          {searchQuery.length >= 2 && searchResults?.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
              {searchResults.map((user) => {
                const isConnected = connectedUserIds.has(user.id)
                return (
                  <div
                    key={user.id}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-bg-card-hover transition-colors"
                  >
                    <Avatar user={user} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{user.display_name || user.username}</div>
                      <div className="text-xs text-text-muted">@{user.username}</div>
                    </div>
                    {isConnected ? (
                      <span className="text-xs text-text-muted font-medium flex-shrink-0">Connected</span>
                    ) : (
                      <button
                        onClick={() => handleSendRequest(user.username)}
                        disabled={sendRequest.isPending}
                        className="py-1 px-3 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {searchQuery.length >= 2 && searchResults?.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 px-4 py-3 text-sm text-text-muted">
              No users found
            </div>
          )}
        </div>
      </div>

      {/* My Squad */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              if (connections?.length) {
                if (squadExpanded && filterMode) setFilterMode(false)
                setSquadExpanded(!squadExpanded)
              }
            }}
            className="flex items-center gap-1.5 text-xs text-text-muted uppercase tracking-wider"
          >
            My Squad {connections?.length > 0 && `(${connections.length})`}
            {connections?.length > 0 && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${squadExpanded ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>
          <div className="flex items-center gap-2">
            {squadExpanded && connections?.length > 0 && (
              <button
                onClick={toggleFilterMode}
                className={`text-xs transition-colors ${filterMode ? 'text-accent font-semibold' : 'text-text-muted hover:text-accent'}`}
              >
                {filterMode ? 'Done' : 'Filter'}
              </button>
            )}
            <InfoTooltip text="Your connections are the users you're linked with. Anyone you've been in a league with is automatically added. You can also search for users by username and send a connection request. Your connections appear first when inviting people to leagues, making it easy to get your people together fast. The 🔥 you see in this list indicates an active win streak." />
          </div>
        </div>
        {!connections?.length ? (
          <div className="bg-bg-primary/50 backdrop-blur-sm border border-text-primary/20 rounded-xl px-4 py-8 text-center text-text-muted text-sm">
            No connections yet. Join a league or search for friends above!
          </div>
        ) : squadExpanded && (
          <div className="bg-bg-primary/50 backdrop-blur-sm border border-text-primary/20 rounded-xl overflow-hidden">
            {(() => {
              const selfEntry = profile ? {
                connection_id: 'self',
                user_id: profile.id,
                username: profile.username,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
                avatar_emoji: profile.avatar_emoji,
                total_points: profile.total_points,
                rank: profile.rank,
                tier: getTier(profile.total_points).name,
                current_streak: 0,
                isSelf: true,
              } : null
              const withSelf = selfEntry ? [...connections, selfEntry] : [...connections]
              return withSelf.sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).map((conn, idx) => (
              <div
                key={conn.connection_id}
                onClick={() => !filterMode && !conn.isSelf && setSelectedUserId(conn.user_id)}
                className={`px-4 py-3 flex items-center gap-3 border-b border-border last:border-b-0 transition-colors ${conn.isSelf ? 'bg-accent/5' : filterMode ? '' : 'cursor-pointer hover:bg-bg-card-hover'}`}
              >
                <div className="w-6 text-center shrink-0">
                  <div className="text-sm font-bold text-accent">{idx + 1}</div>
                </div>
                <Avatar user={conn} size="xl" />
                <div className="min-w-0 flex-1">
                  <div className={`font-medium text-sm truncate ${conn.isSelf ? 'text-accent' : ''}`}>{conn.isSelf ? `${conn.display_name || conn.username} (You)` : conn.display_name || conn.username}</div>
                  <div className="text-xs text-text-muted">@{conn.username}{conn.rank ? ` · ovr ${conn.rank}` : ''}</div>
                </div>
                {filterMode && !conn.isSelf ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveConnection(conn)
                    }}
                    disabled={removeConnection.isPending}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {conn.current_streak > 0 && (
                      <span className="text-xs text-text-muted flex items-center gap-0.5">
                        <span className="text-orange-400">{'\uD83D\uDD25'}</span>
                        {conn.current_streak}
                      </span>
                    )}
                    <TierBadge tier={conn.tier} size="xs" />
                  </div>
                )}
              </div>
            ))
            })()}
          </div>
        )}
      </div>

      {/* Activity Feed + News sidebar */}
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs text-text-muted uppercase tracking-wider flex-shrink-0">Feed</h2>
          <div className="flex gap-1 overflow-x-auto flex-nowrap no-scrollbar">
            {[
              { key: 'all', label: 'All of IKB' },
              { key: 'squad', label: 'My Squad' },
              { key: 'highlights', label: 'Me' },
              { key: 'news', label: 'News', mobileOnly: true },
              { key: 'user_feeds', label: 'User Feeds' },
              { key: 'polls', label: 'Polls' },
              { key: 'predictions', label: 'Predictions' },
              { key: 'receipts', label: 'Receipts' },
            ].filter((tab) => !tab.mobileOnly || !window.matchMedia('(min-width: 1024px)').matches).map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleScopeToggle(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex-shrink-0 border ${
                  feedScope === tab.key ? 'bg-bg-primary/50 border-accent text-accent' : 'bg-bg-primary/50 border-text-primary/20 text-text-secondary hover:border-text-primary/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {/* Filter toggle for All of IKB */}
        {feedScope === 'all' && (
          <div className="mb-3">
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                showFilterPanel ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              {showFilterPanel ? 'Show All' : 'Filter by Sport'}
            </button>
          </div>
        )}

        {feedScope === 'receipts' ? (
          <ReceiptsTab onUserTap={setSelectedUserId} />
        ) : feedScope === 'user_feeds' ? (
          <UserFeedTab onUserTap={setSelectedUserId} initialUserId={initialFeedUserId} />
        ) : feedScope === 'highlights' ? (
          <ActivityFeed
            onUserTap={setSelectedUserId}
            scope="highlights"
            scrollToItemId={scrollToItem}
            onScrollComplete={() => setScrollToItem(null)}
          />
        ) : feedScope === 'polls' ? (
          <ActivityFeed
            onUserTap={setSelectedUserId}
            scope="polls"
            scrollToItemId={scrollToItem}
            onScrollComplete={() => setScrollToItem(null)}
          />
        ) : feedScope === 'predictions' ? (
          <ActivityFeed
            onUserTap={setSelectedUserId}
            scope="predictions"
            scrollToItemId={scrollToItem}
            onScrollComplete={() => setScrollToItem(null)}
          />
        ) : feedScope === 'all' && showFilterPanel ? (
          <TeamFeed onUserTap={setSelectedUserId} />
        ) : feedScope === 'news' ? (
          <NewsFeed />
        ) : (
          <ActivityFeed
            onUserTap={setSelectedUserId}
            scope={feedScope}
            scrollToItemId={scrollToItem}
            onScrollComplete={() => setScrollToItem(null)}
          />
        )}
      </div>

      {/* Desktop news sidebar */}
      <div className="hidden lg:block">
        <div className="sticky top-4">
          <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">News</h2>
          <NewsFeed compact />
        </div>
      </div>
      </div>

      <UserProfileModal
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  )
}
