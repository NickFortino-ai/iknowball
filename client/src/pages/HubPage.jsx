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
import ActivityFeed from '../components/feed/ActivityFeed'
import TeamFeed from '../components/feed/TeamFeed'
import { useTeamsForSport } from '../hooks/useHotTakes'
import ReceiptsTab from '../components/feed/ReceiptsTab'
import UserFeedTab from '../components/feed/UserFeedTab'
import ArcadeRoom, { ArcadeIcon } from '../components/arcade/ArcadeRoom'
import NewsFeed from '../components/feed/NewsFeed'
import Avatar from '../components/ui/Avatar'
import MyProfileBanner from '../components/hub/MyProfileBanner'
import { useBackClosable } from '../hooks/useBackClosable'
import { NewsIcon, FeedIcon, RoomButton } from '../components/hub/RoomIcons'

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

const VALID_SCOPES = new Set(['squad', 'all', 'highlights', 'polls', 'predictions', 'receipts', 'user_feeds'])

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
  // The arcade is a room, not a feed scope — it replaces the feed and the
  // news rail rather than filtering them, so it gets its own flag. Seeded
  // from ?tab=arcade so the old deep link still lands somewhere sensible.
  // Search is a magnifier beside the title rather than a permanent bar. It
  // is used rarely — you search for someone once, then they're in your squad
  // — and as a full-width input it was charging every visit for that.
  const [searchOpen, setSearchOpen] = useState(false)
  // Which ROOM the Hub is showing: the feed, the news list, or the arcade.
  // These are places, not feed filters — each replaces the page rather than
  // narrowing what is in it — so they are one piece of state, not a flag
  // each. Seeded from ?tab=arcade so the old deep link still lands.
  const [hubView, setHubView] = useState(() => (searchParams.get('tab') === 'arcade' ? 'arcade' : 'feed'))
  const hasManuallyToggled = useRef(false)
  // Where the feed was when the arcade opened, so closing it puts you back
  // rather than at the top of a page you'd already scrolled through.
  const scrollBeforeArcade = useRef(0)

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
    if (tab === 'arcade' || tab === 'news') {
      // Not scopes any more, but notifications and old links still use them.
      setHubView(tab)
    } else if (tab && VALID_SCOPES.has(tab)) {
      hasManuallyToggled.current = true
      setFeedScope(tab)
    } else if (tab === 'team_feed') {
      // team_feed isn't a top-level scope — render via the All-of-IKB feed
      // with the sport/team filter panel activated and the requested team
      // pre-selected. Without this branch the scope wouldn't switch and the
      // URL would just revert to /hub a moment later.
      hasManuallyToggled.current = true
      setFeedScope('all')
      setShowFilterPanel(true)
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

  // Android's Back and iOS's edge swipe must close the room, not exit the
  // Hub. The room is state rather than a route, so it has to say so.
  useBackClosable(hubView !== 'feed', () => setHubView('feed'))

  useEffect(() => {
    if (hubView !== 'feed') {
      scrollBeforeArcade.current = window.scrollY
      window.scrollTo(0, 0)
    } else if (scrollBeforeArcade.current) {
      // After paint, or the feed hasn't re-rendered to its full height yet
      // and the browser clamps the restore to a shorter page.
      const y = scrollBeforeArcade.current
      scrollBeforeArcade.current = 0
      requestAnimationFrame(() => window.scrollTo(0, y))
    }
  }, [hubView])

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
      setFeedScope('all')
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

  // The user search, rendered beside the profile card on desktop and under
  // it on mobile. A function rather than a component so it keeps using the
  // page's search state directly — extracting it to a component would mean
  // threading five props to move one input.
  //
  // The old 'SEARCH USER' heading is gone: a label above a box whose
  // placeholder already says the same thing is the heading saying it twice.
  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
  }

  function renderSearch() {
    return (
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') closeSearch() }}
                placeholder="Search by username..."
                autoFocus
                className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
    
              {searchQuery.length >= 2 && searchResults?.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-10 space-y-1.5">
                  {searchResults.map((user) => {
                    const isConnected = connectedUserIds.has(user.id)
                    return (
                      <div
                        key={user.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedUserId(user.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedUserId(user.id) }}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 bg-bg-primary border border-text-primary/20 rounded-lg hover:bg-text-primary/5 transition-colors cursor-pointer"
                      >
                        <Avatar user={user} size="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-text-primary truncate">{user.display_name || user.username}</div>
                          <div className="text-xs text-text-muted">@{user.username}</div>
                        </div>
                        {isConnected ? (
                          <span className="text-xs text-text-muted font-medium flex-shrink-0">Connected</span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSendRequest(user.username) }}
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
                <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-bg-primary border border-text-primary/20 rounded-lg px-4 py-3 text-sm text-text-muted">
                  No users found
                </div>
              )}
            </div>
    )
  }

  // The squad header, rendered in the banner row on desktop and above the
  // list on mobile.
  //
  // All three controls cluster on the LEFT. They used to sit at opposite ends
  // of a full-width row, which put the info icon and Filter in the arcade's
  // column and reserved that whole vertical band for two small controls —
  // the arcade could not grow into it. Together on the left they read as one
  // group ("my squad, what it is, how to filter it") and the right of the
  // row is free.
  function renderSquadHeader(marginClass = 'mb-3') {
    return (
      <div className={`flex items-center gap-2 ${marginClass}`}>
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
        <InfoTooltip text="Your squad is your network on I KNOW BALL. Search for users by username and send connection requests, or enable auto-connect on a league to link up with leaguemates automatically. Your connections appear first when inviting people to leagues. The 🔥 indicates an active win streak." />
        {squadExpanded && connections?.length > 0 && (
          <button
            onClick={toggleFilterMode}
            className={`text-xs transition-colors ${filterMode ? 'text-accent font-semibold' : 'text-text-muted hover:text-accent'}`}
          >
            {filterMode ? 'Done' : 'Filter'}
          </button>
        )}
      </div>
    )
  }

  // The arcade is a ROOM: it replaces the Hub, not the feed inside it.
  //
  // Scoping the takeover to the feed left the profile card, search and squad
  // stacked above it — tolerable on desktop, where the arcade still fills the
  // wide column you're already looking at, but on a phone you tapped Arcade
  // and it landed below the fold. Nothing appeared to happen.
  if (hubView === 'arcade') {
    return (
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 pt-6 pb-32">
        <ArcadeRoom onExit={() => setHubView('feed')} />
      </div>
    )
  }

  // News is a room on MOBILE only — on desktop it never left the sidebar, so
  // there is nothing to open.
  if (hubView === 'news') {
    return (
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 pt-6 pb-32">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setHubView('feed')}
            aria-label="Back to feed"
            className="-ml-2 flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2 text-text-muted hover:text-text-primary transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="text-xs font-semibold">Feed</span>
          </button>
          <NewsIcon className="w-9 h-9 shrink-0" />
          <h2 className="font-display text-xl text-text-primary leading-none">News</h2>
        </div>
        {/* NewsFeed brings its own sport tabs, so the room is just the list. */}
        <NewsFeed />
      </div>
    )
  }

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 pt-6 pb-32">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="font-display text-3xl">Hub</h1>
        <button
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          aria-label={searchOpen ? 'Close search' : 'Search users'}
          aria-expanded={searchOpen}
          className={`shrink-0 rounded-lg p-2 transition-colors ${
            searchOpen ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
      </div>

      {/* Revealed under the title rather than expanding inside it: at 375px
          the title row has no width to give, and results need the full page
          anyway. */}
      {searchOpen && <div className="mb-6">{renderSearch()}</div>}

      {/* Identity card + the things you DO from the Hub, side by side on
          desktop. Search used to be a full-width block of its own under the
          banner, which gave a one-line input the same vertical weight as the
          profile card and pushed the feed down. Paired with the banner it
          costs no extra height, and the room it frees is what the arcade
          button now occupies.

          Stacks on mobile in the same order as before — banner, search —
          so the phone layout is unchanged for now. */}
      <div className="lg:flex lg:items-stretch lg:gap-4 lg:mb-3">
        <div className="lg:flex-1 lg:min-w-0 lg:flex lg:flex-col">
          {profile && (
            <MyProfileBanner
              profile={profile}
              onTap={() => setSelectedUserId(session?.user?.id)}
              layoutClassName="mb-6 lg:mb-0"
            />
          )}
          {/* Desktop: the squad header shares this row, which is what lets
              the arcade column extend down past the profile card. The list
              itself stays full width below. Mobile renders its own copy in
              document order instead — search and the arcade come first
              there, so this one can't simply move. */}
          <div className="hidden lg:block lg:mt-auto lg:pt-3">{renderSquadHeader('mb-0')}</div>
        </div>
        {/* Mobile gets all three rooms as a row of marks; desktop gets the
            arcade alone, because news never leaves the sidebar there and the
            feed is simply the page you are on. */}
        <div className="mb-6 lg:mb-0 lg:w-72 lg:shrink-0 lg:flex lg:pb-3">
          <div className="grid w-full grid-cols-3 gap-1 lg:hidden">
            <RoomButton icon={FeedIcon} label="Feed" iconClass="w-11 h-11" active={hubView === 'feed'} onClick={() => setHubView('feed')} />
            <RoomButton icon={NewsIcon} label="News" active={hubView === 'news'} onClick={() => setHubView('news')} />
            <RoomButton icon={ArcadeIcon} label="Arcade" active={hubView === 'arcade'} onClick={() => setHubView('arcade')} />
          </div>
          {/* No border, no fill — the cabinet IS the button. A bordered box
              around art that already has its own outline and glow was two
              frames competing; stripped back, the icon can grow into the
              whole space instead of sitting in the middle of a panel. */}
          <button
            onClick={() => setHubView('arcade')}
            aria-label="Arcade"
            className="hidden lg:flex w-full lg:flex-1 flex-col items-center justify-center gap-1 min-h-0 text-accent transition-transform hover:scale-105 active:scale-95"
          >
            {/* The icon is positioned OUT OF FLOW on desktop. In flow its
                intrinsic 256px height counts toward this column's content
                height, which stretches the row — and the profile card with
                it — to nearly twice its size. Absolute inside a flex-1 box,
                it fills whatever height is left over instead of asking for
                any. The small floor only matters for accounts with no
                backdrop, whose banner is short enough that there is barely
                any left over. */}
            <span className="relative hidden lg:block lg:flex-1 w-full min-h-[56px]">
              <ArcadeIcon className="absolute inset-0 w-full h-full" />
            </span>
            <span className="text-sm font-semibold leading-none">Arcade</span>
          </button>
        </div>
      </div>

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

      {/* My Squad */}
      {/* mb-6 only on mobile, where this wrapper always holds the header. On
          desktop the header lives in the banner row and this is empty
          whenever the list is collapsed — the margin was spacing nothing. */}
      <div className="mb-6 lg:mb-0">
        <div className="lg:hidden">{renderSquadHeader()}</div>
        {!connections?.length ? (
          <div className="lg:mb-6 bg-bg-primary/50 backdrop-blur-sm border border-text-primary/20 rounded-xl px-4 py-8 text-center text-text-muted text-sm">
            No connections yet. Join a league or search for friends above!
          </div>
        ) : squadExpanded && (
          <div className="lg:mb-6 bg-bg-primary/50 backdrop-blur-sm border border-text-primary/20 rounded-xl overflow-hidden">
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
      {/* minmax(0,1fr), not 1fr. A bare `1fr` track is `minmax(auto, 1fr)`,
          so the column's MINIMUM is its content's max-content width — any
          horizontal scroller inside (the feed tabs, the arcade's image-set
          row) widens the whole track and runs the page off the right edge
          instead of scrolling within its own box. min-w-0 on descendants
          can't fix that; the constraint is the track, and the grid ITEM
          (the div below) needs it too. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs text-text-muted uppercase tracking-wider flex-shrink-0">Feed</h2>
          {/* min-w-0 or the scroller claims its max-content width and the
              last tab ends up underneath whatever is pinned to its right —
              "Receipts" was being clipped by the arcade button. */}
          <div className="flex gap-1 overflow-x-auto flex-nowrap no-scrollbar min-w-0">
            {[
              { key: 'all', label: 'All of IKB' },
              { key: 'squad', label: 'My Squad' },
              { key: 'posts', label: 'Posts' },
              { key: 'polls', label: 'Polls' },
              { key: 'predictions', label: 'Predictions' },
              { key: 'highlights', label: 'Me' },
              { key: 'user_feeds', label: 'User Feeds' },
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
        ) : feedScope === 'posts' ? (
          <ActivityFeed
            onUserTap={setSelectedUserId}
            scope="posts"
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
          <TeamFeed
            onUserTap={setSelectedUserId}
            initialTeam={initialTeam}
            onTeamConsumed={() => setInitialTeam(null)}
          />
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
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] flex flex-col">
          <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3 flex-shrink-0">News</h2>
          <div className="flex-1 overflow-y-auto overscroll-contain pr-1">
            <NewsFeed compact />
          </div>
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
