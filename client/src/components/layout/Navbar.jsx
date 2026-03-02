import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useAccountSwitcher } from '../../hooks/useAccountSwitcher'
import { useMyInvitations, useAcceptInvitation, useDeclineInvitation } from '../../hooks/useInvitations'
import { usePendingConnectionRequests, useAcceptConnectionRequest, useDeclineConnectionRequest } from '../../hooks/useConnections'
import { useNotifications, useUnreadNotificationCount, useMarkAllNotificationsRead } from '../../hooks/useNotifications'
import { getTier } from '../../lib/scoring'
import TierBadge from '../ui/TierBadge'
import PickDetailModal from '../social/PickDetailModal'
import ParlayResultModal from '../picks/ParlayResultModal'
import PropDetailModal from '../picks/PropDetailModal'
import SurvivorWinModal from '../leagues/SurvivorWinModal'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  all: 'All Sports',
}

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
}

const navLinks = [
  { to: '/picks', label: 'Picks' },
  { to: '/results', label: 'Results' },
  { to: '/leagues', label: 'Leagues' },
  { to: '/leaderboard', label: 'Board' },
  { to: '/hub', label: 'Hub' },
]

function getNotificationRoute(notification) {
  if (notification.metadata?.pickId) return null // handled by modal
  if (notification.metadata?.parlayId) return null // handled by modal
  if (notification.metadata?.propPickId) return null // handled by modal
  switch (notification.type) {
    case 'parlay_result':
    case 'futures_result':
    case 'streak_milestone':
      return '/results'
    case 'connection_request':
      return '/hub'
    case 'headlines':
      return '/hall-of-fame'
    case 'record_broken':
      return '/hall-of-fame?section=records'
    case 'survivor_win':
      return null // handled by modal
    case 'squares_quarter_win':
    case 'survivor_result':
      return notification.metadata?.leagueId ? `/leagues/${notification.metadata.leagueId}` : null
    default:
      return null
  }
}

export default function Navbar() {
  const { isAuthenticated, profile, signOut } = useAuth()
  const { savedAccounts, inactiveAccounts, currentUserId, switching, unreadCounts, refreshUnreadCounts, resetFetchState, handleSwitch, handleRemove } = useAccountSwitcher()
  const location = useLocation()
  const navigate = useNavigate()
  const [showInvites, setShowInvites] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showDesktopMenu, setShowDesktopMenu] = useState(false)
  const [selectedPickId, setSelectedPickId] = useState(null)
  const [selectedParlayId, setSelectedParlayId] = useState(null)
  const [selectedPropPickId, setSelectedPropPickId] = useState(null)
  const [survivorWinData, setSurvivorWinData] = useState(null)
  const dropdownRef = useRef(null)
  const mobileDropdownRef = useRef(null)
  const mobileMenuRef = useRef(null)
  const desktopMenuRef = useRef(null)
  const wasOpenRef = useRef(false)

  // Mark notifications as read when dropdown closes (not when it opens)
  useEffect(() => {
    if (wasOpenRef.current && !showInvites) {
      markAllRead.mutate()
    }
    wasOpenRef.current = showInvites
  }, [showInvites])

  const { data: invitations } = useMyInvitations(isAuthenticated)
  const acceptInvitation = useAcceptInvitation()
  const declineInvitation = useDeclineInvitation()

  const { data: pendingConnections } = usePendingConnectionRequests(isAuthenticated)
  const acceptConnection = useAcceptConnectionRequest()
  const declineConnection = useDeclineConnectionRequest()

  const { data: notifications } = useNotifications(isAuthenticated)
  const { data: unreadData } = useUnreadNotificationCount(isAuthenticated)
  const markAllRead = useMarkAllNotificationsRead()

  const inviteCount = invitations?.length || 0
  const connectionCount = pendingConnections?.length || 0
  const notificationCount = unreadData?.count || 0
  const pendingCount = inviteCount + connectionCount + notificationCount

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        (!mobileDropdownRef.current || !mobileDropdownRef.current.contains(e.target))
      ) {
        setShowInvites(false)
      }
    }
    if (showInvites) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showInvites])

  // Close mobile menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setShowMobileMenu(false)
      }
    }
    if (showMobileMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMobileMenu])

  // Close desktop menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(e.target)) {
        setShowDesktopMenu(false)
      }
    }
    if (showDesktopMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDesktopMenu])

  // Close menus on route change
  useEffect(() => {
    setShowMobileMenu(false)
    setShowDesktopMenu(false)
    resetFetchState()
  }, [location.pathname])

  async function handleAccept(invitationId) {
    try {
      const result = await acceptInvitation.mutateAsync(invitationId)
      toast('Joined league!', 'success')
      setShowInvites(false)
      setShowMobileMenu(false)
      navigate(`/leagues/${result.league_id}`)
    } catch (err) {
      toast(err.message || 'Failed to accept invite', 'error')
    }
  }

  async function handleDecline(invitationId) {
    try {
      await declineInvitation.mutateAsync(invitationId)
      toast('Invite declined', 'info')
    } catch (err) {
      toast(err.message || 'Failed to decline invite', 'error')
    }
  }

  async function handleAcceptConnection(connectionId) {
    try {
      await acceptConnection.mutateAsync(connectionId)
      toast('Connection accepted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to accept', 'error')
    }
  }

  async function handleDeclineConnection(connectionId) {
    try {
      await declineConnection.mutateAsync(connectionId)
      toast('Request declined', 'info')
    } catch (err) {
      toast(err.message || 'Failed to decline', 'error')
    }
  }

  async function handleShare() {
    const url = window.location.origin
    try {
      if (navigator.share) {
        await navigator.share({ title: 'I KNOW BALL', url })
      } else {
        await navigator.clipboard.writeText(url)
        toast('Link copied to clipboard!', 'success')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        await navigator.clipboard.writeText(url)
        toast('Link copied to clipboard!', 'success')
      }
    }
    setShowMobileMenu(false)
    setShowDesktopMenu(false)
  }

  return (
    <>
    <nav className="bg-bg-secondary border-b border-border sticky top-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-display text-xl text-accent tracking-tight">
          I KNOW BALL
        </Link>

        {isAuthenticated && (
          <div className="flex items-center gap-1 sm:gap-4">
            {/* Desktop nav links — hidden on mobile */}
            <div className="hidden md:flex items-center gap-1 sm:gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l border-border">
              {/* Notification Bell — desktop */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowInvites(!showInvites)}
                  className="relative p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                  aria-label="Notifications"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {pendingCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-incorrect text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {showInvites && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <h3 className="font-semibold text-sm">Notifications</h3>
                    </div>

                    {inviteCount === 0 && connectionCount === 0 && !notifications?.length ? (
                      <div className="px-4 py-6 text-center text-text-muted text-sm">
                        No pending notifications
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        {invitations?.map((invite) => (
                          <div key={invite.id} className="px-4 py-3 border-b border-border last:border-b-0">
                            <div className="text-sm font-medium mb-1">{invite.leagues?.name}</div>
                            <div className="text-xs text-text-muted mb-2">
                              {FORMAT_LABELS[invite.leagues?.format]} · {SPORT_LABELS[invite.leagues?.sport]} · from @{invite.inviter?.username}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAccept(invite.id)}
                                disabled={acceptInvitation.isPending}
                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleDecline(invite.id)}
                                disabled={declineInvitation.isPending}
                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-bg-secondary text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                        {pendingConnections?.map((req) => (
                          <div key={req.id} className="px-4 py-3 border-b border-border last:border-b-0">
                            <div className="text-sm font-medium mb-1">Connection Request</div>
                            <div className="text-xs text-text-muted mb-2">
                              @{req.requester?.username} wants to connect
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAcceptConnection(req.id)}
                                disabled={acceptConnection.isPending}
                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleDeclineConnection(req.id)}
                                disabled={declineConnection.isPending}
                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-bg-secondary text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                        {notifications?.map((n) => {
                          const route = getNotificationRoute(n)
                          const isSurvivorWin = n.type === 'survivor_win'
                          const isSurvivorStreakEnd = n.type === 'survivor_result' && n.metadata?.streakEnded
                          const tappable = n.metadata?.pickId || n.metadata?.parlayId || n.metadata?.propPickId || isSurvivorWin || isSurvivorStreakEnd || route
                          return (
                            <div
                              key={n.id}
                              className={`px-4 py-3 border-b border-border last:border-b-0${tappable ? ' cursor-pointer hover:bg-bg-card-hover transition-colors' : ''}`}
                              onClick={() => {
                                if (n.metadata?.pickId) { setSelectedPickId(n.metadata.pickId); setShowInvites(false) }
                                else if (n.metadata?.parlayId) { setSelectedParlayId(n.metadata.parlayId); setShowInvites(false) }
                                else if (n.metadata?.propPickId) { setSelectedPropPickId(n.metadata.propPickId); setShowInvites(false) }
                                else if (isSurvivorWin) {
                                  if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}`)
                                  setSurvivorWinData({ mode: 'win', ...n.metadata })
                                  setShowInvites(false)
                                }
                                else if (isSurvivorStreakEnd) {
                                  if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}`)
                                  setSurvivorWinData({ mode: 'streak_ended', ...n.metadata })
                                  setShowInvites(false)
                                }
                                else if (route) { navigate(route); setShowInvites(false) }
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <span className="flex-shrink-0">{n.type === 'reaction' ? '\uD83D\uDD25' : n.type === 'comment' ? '\uD83D\uDCAC' : n.type === 'survivor_win' ? '\uD83D\uDC51' : '\uD83C\uDFC6'}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm">{n.message}</div>
                                  <div className="text-xs text-text-muted mt-0.5">{timeAgo(n.created_at)}</div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {profile && (
                <Link to="/hub" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <TierBadge tier={getTier(profile.total_points).name} size="xs" />
                  <span className="text-sm text-text-secondary hidden sm:inline">{profile.username}</span>
                </Link>
              )}
              {/* Desktop hamburger menu */}
              <div className="relative" ref={desktopMenuRef}>
                <button
                  data-onboarding="hamburger-menu"
                  onClick={() => { setShowInvites(false); if (!showDesktopMenu) refreshUnreadCounts(); else resetFetchState(); setShowDesktopMenu(!showDesktopMenu) }}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                  aria-label="Menu"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {showDesktopMenu ? (
                      <>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </>
                    ) : (
                      <>
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </>
                    )}
                  </svg>
                </button>

                {showDesktopMenu && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                    {/* Account switcher */}
                    <div className="border-b border-border">
                      {/* Active account */}
                      {profile && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm flex-shrink-0">
                            {profile.avatar_emoji || profile.username?.[0]?.toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{profile.display_name || profile.username}</div>
                            <div className="text-xs text-text-muted truncate">@{profile.username}</div>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-correct flex-shrink-0">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                      {/* Inactive accounts */}
                      {inactiveAccounts.map((account) => {
                        const info = unreadCounts[account.userId]
                        return (
                          <div key={account.userId} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-card-hover transition-colors cursor-pointer group" onClick={() => { setShowDesktopMenu(false); handleSwitch(account.userId) }}>
                            <span className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-sm flex-shrink-0">
                              {account.avatarEmoji || account.username?.[0]?.toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{account.displayName}</div>
                              <div className="text-xs text-text-muted truncate">@{account.username}</div>
                            </div>
                            {info?.error ? (
                              <span className="text-[10px] text-text-muted italic flex-shrink-0">expired</span>
                            ) : info?.count > 0 ? (
                              <span className="w-5 h-5 bg-incorrect text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                                {info.count > 9 ? '9+' : info.count}
                              </span>
                            ) : null}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemove(account.userId) }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-text-primary transition-opacity flex-shrink-0"
                              aria-label="Remove account"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                      <Link
                        to="/login"
                        onClick={() => setShowDesktopMenu(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-accent hover:bg-bg-card-hover transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full border border-dashed border-accent/50 flex items-center justify-center flex-shrink-0">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </span>
                        Add an existing account
                      </Link>
                    </div>
                    <Link
                      to="/hall-of-fame"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
                        <path d="M4 22h16" />
                        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20h10c0-.76-.85-1.25-2.03-1.79C14.47 17.98 14 17.55 14 17v-2.34" />
                        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                      </svg>
                      Hall of Fame
                    </Link>
                    <button
                      onClick={handleShare}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                      Share IKB
                    </button>
                    <Link
                      to="/faq"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      FAQ
                    </Link>
                    <Link
                      to="/privacy"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      Privacy
                    </Link>
                    <Link
                      to="/settings"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Settings
                    </Link>
                    {profile?.is_admin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Admin
                      </Link>
                    )}
                    <div className="border-t border-border">
                      <button
                        onClick={signOut}
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile: notification bell + hamburger */}
            <div className="flex items-center gap-1 md:hidden">
              {/* Notification bell — mobile */}
              <button
                onClick={() => { setShowMobileMenu(false); setShowInvites(!showInvites) }}
                className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Notifications"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {pendingCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-incorrect text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>

              {/* Hamburger */}
              <div ref={mobileMenuRef}>
                <button
                  data-onboarding="hamburger-menu"
                  onClick={() => { setShowInvites(false); if (!showMobileMenu) refreshUnreadCounts(); else resetFetchState(); setShowMobileMenu(!showMobileMenu) }}
                  className="p-2 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                  aria-label="Menu"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {showMobileMenu ? (
                      <>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </>
                    ) : (
                      <>
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </>
                    )}
                  </svg>
                </button>

                {/* Mobile dropdown menu */}
                {showMobileMenu && (
                  <div className="absolute right-4 top-full mt-1 w-56 bg-bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                    {/* Account switcher */}
                    <div className="border-b border-border">
                      {profile && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm flex-shrink-0">
                            {profile.avatar_emoji || profile.username?.[0]?.toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{profile.display_name || profile.username}</div>
                            <div className="text-xs text-text-muted truncate">@{profile.username}</div>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-correct flex-shrink-0">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                      {inactiveAccounts.map((account) => {
                        const info = unreadCounts[account.userId]
                        return (
                          <div key={account.userId} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-card-hover transition-colors cursor-pointer" onClick={() => { setShowMobileMenu(false); handleSwitch(account.userId) }}>
                            <span className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-sm flex-shrink-0">
                              {account.avatarEmoji || account.username?.[0]?.toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{account.displayName}</div>
                              <div className="text-xs text-text-muted truncate">@{account.username}</div>
                            </div>
                            {info?.error ? (
                              <span className="text-[10px] text-text-muted italic flex-shrink-0">expired</span>
                            ) : info?.count > 0 ? (
                              <span className="w-5 h-5 bg-incorrect text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                                {info.count > 9 ? '9+' : info.count}
                              </span>
                            ) : null}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemove(account.userId) }}
                              className="p-1 text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                              aria-label="Remove account"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                      <Link
                        to="/login"
                        onClick={() => setShowMobileMenu(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-accent hover:bg-bg-card-hover transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full border border-dashed border-accent/50 flex items-center justify-center flex-shrink-0">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </span>
                        Add an existing account
                      </Link>
                    </div>
                    <Link
                      to="/hall-of-fame"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
                        <path d="M4 22h16" />
                        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20h10c0-.76-.85-1.25-2.03-1.79C14.47 17.98 14 17.55 14 17v-2.34" />
                        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                      </svg>
                      Hall of Fame
                    </Link>
                    <button
                      onClick={handleShare}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                      Share IKB
                    </button>
                    <Link
                      to="/faq"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      FAQ
                    </Link>
                    <Link
                      to="/privacy"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      Privacy
                    </Link>
                    <Link
                      to="/settings"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Settings
                    </Link>
                    {profile?.is_admin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Admin
                      </Link>
                    )}
                    <div className="border-t border-border">
                      <button
                        onClick={signOut}
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile notifications dropdown (shared position) */}
            {showInvites && (
              <div ref={mobileDropdownRef} className="absolute right-4 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] bg-bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden md:hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="font-semibold text-sm">Notifications</h3>
                </div>

                {inviteCount === 0 && connectionCount === 0 && !notifications?.length ? (
                  <div className="px-4 py-6 text-center text-text-muted text-sm">
                    No pending notifications
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {invitations?.map((invite) => (
                      <div key={invite.id} className="px-4 py-3 border-b border-border last:border-b-0">
                        <div className="text-sm font-medium mb-1">{invite.leagues?.name}</div>
                        <div className="text-xs text-text-muted mb-2">
                          {FORMAT_LABELS[invite.leagues?.format]} · {SPORT_LABELS[invite.leagues?.sport]} · from @{invite.inviter?.username}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAccept(invite.id)}
                            disabled={acceptInvitation.isPending}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDecline(invite.id)}
                            disabled={declineInvitation.isPending}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-bg-secondary text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                    {pendingConnections?.map((req) => (
                      <div key={req.id} className="px-4 py-3 border-b border-border last:border-b-0">
                        <div className="text-sm font-medium mb-1">Connection Request</div>
                        <div className="text-xs text-text-muted mb-2">
                          @{req.requester?.username} wants to connect
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptConnection(req.id)}
                            disabled={acceptConnection.isPending}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeclineConnection(req.id)}
                            disabled={declineConnection.isPending}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-bg-secondary text-text-secondary hover:bg-border transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                    {notifications?.map((n) => {
                      const route = getNotificationRoute(n)
                      const isSurvivorWin = n.type === 'survivor_win'
                      const isSurvivorStreakEnd = n.type === 'survivor_result' && n.metadata?.streakEnded
                      const tappable = n.metadata?.pickId || n.metadata?.parlayId || n.metadata?.propPickId || isSurvivorWin || isSurvivorStreakEnd || route
                      return (
                        <div
                          key={n.id}
                          className={`px-4 py-3 border-b border-border last:border-b-0${tappable ? ' cursor-pointer hover:bg-bg-card-hover transition-colors' : ''}`}
                          onClick={() => {
                            if (n.metadata?.pickId) { setSelectedPickId(n.metadata.pickId); setShowInvites(false) }
                            else if (n.metadata?.parlayId) { setSelectedParlayId(n.metadata.parlayId); setShowInvites(false) }
                            else if (n.metadata?.propPickId) { setSelectedPropPickId(n.metadata.propPickId); setShowInvites(false) }
                            else if (isSurvivorWin) {
                              if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}`)
                              setSurvivorWinData({ mode: 'win', ...n.metadata })
                              setShowInvites(false)
                            }
                            else if (isSurvivorStreakEnd) {
                              if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}`)
                              setSurvivorWinData({ mode: 'streak_ended', ...n.metadata })
                              setShowInvites(false)
                            }
                            else if (route) { navigate(route); setShowInvites(false) }
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <span className="flex-shrink-0">{n.type === 'reaction' ? '\uD83D\uDD25' : n.type === 'comment' ? '\uD83D\uDCAC' : n.type === 'survivor_win' ? '\uD83D\uDC51' : '\uD83C\uDFC6'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm">{n.message}</div>
                              <div className="text-xs text-text-muted mt-0.5">{timeAgo(n.created_at)}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isAuthenticated && (
          <div className="flex items-center gap-2">
            <Link to="/login" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              Sign In
            </Link>
            <Link to="/signup" className="text-sm bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-lg transition-colors font-medium">
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </nav>
    <PickDetailModal pickId={selectedPickId} onClose={() => setSelectedPickId(null)} />
    <ParlayResultModal parlayId={selectedParlayId} onClose={() => setSelectedParlayId(null)} />
    <PropDetailModal propPickId={selectedPropPickId} onClose={() => setSelectedPropPickId(null)} />
    <SurvivorWinModal data={survivorWinData} onClose={() => setSurvivorWinData(null)} />
    </>
  )
}
