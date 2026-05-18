import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { useAuth } from '../../hooks/useAuth'
import { useAccountSwitcher } from '../../hooks/useAccountSwitcher'
import { useMyInvitations, useAcceptInvitation, useDeclineInvitation } from '../../hooks/useInvitations'
import { usePendingConnectionRequests, useAcceptConnectionRequest, useDeclineConnectionRequest } from '../../hooks/useConnections'
import { useNotifications, useUnreadNotificationCount, useMarkAllNotificationsRead } from '../../hooks/useNotifications'
import { useUnreadMessageCount } from '../../hooks/useMessages'
import { getTier } from '../../lib/scoring'
import TierBadge from '../ui/TierBadge'
import PickDetailModal from '../social/PickDetailModal'
import FuturesHitModalWrapper from '../feed/FuturesHitModalWrapper'
import ParlayResultModal from '../picks/ParlayResultModal'
import PropDetailModal from '../picks/PropDetailModal'
import LeagueWinModal from '../leagues/LeagueWinModal'
import HotTakeDetailModal from '../feed/HotTakeDetailModal'
import StreakDetailModal from '../feed/StreakDetailModal'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  all: 'All Sports',
}

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA Daily Fantasy',
  mlb_dfs: 'MLB Daily Fantasy',
  hr_derby: 'Home Run Derby',
  strikeouts: 'Strikeouts Contest',
  three_point: 'NBA 3-Point Contest',
  wnba_three_point: 'WNBA 3-Point Contest',
  sacks: 'Sacks Contest',
  ints: 'Interceptions Contest',
  tackles: 'Solo Tackles Contest',
  receptions: 'Receptions Contest',
  td_pass: 'TD Pass Competition',
}

const navLinks = [
  { to: '/picks', label: 'Picks' },
  { to: '/results', label: 'Results' },
  { to: '/leagues', label: 'Leagues' },
  { to: '/leaderboard', label: 'Board' },
  { to: '/hub', label: 'Hub' },
]

function getNotificationIcon(n) {
  switch (n.type) {
    // Social
    case 'reaction': {
      const reactionEmojis = { fire: '🔥', clown: '🤡', goat: '🐐', clap: '👏' }
      return reactionEmojis[n.metadata?.reactionType] || '🔥'
    }
    case 'comment': return '\uD83D\uDCAC' // 💬
    case 'league_thread_mention': return '\uD83D\uDCAC' // 💬
    case 'hot_take_callout': return '\uD83C\uDFF7\uFE0F' // 🏷️
    case 'connection_request': return '\uD83E\uDD1D' // 🤝
    case 'connection_accepted': return '\uD83E\uDD1D' // 🤝
    case 'league_invitation': return '\uD83D\uDCE8' // 📨
    case 'invite_requested': return '\u270B' // raised hand — invite request
    case 'league_deleted': return '\uD83D\uDDD1\uFE0F' // 🗑️
    case 'streak_milestone': return '\uD83D\uDD25' // 🔥
    case 'league_at_risk': return '\u26A0\uFE0F' // ⚠️
    case 'league_canceled_solo': return '\uD83D\uDDD1\uFE0F' // 🗑️
    case 'headlines': return '\uD83D\uDCF0' // 📰
    case 'hot_take_reminder': return '\uD83D\uDD14' // 🔔
    case 'hot_take_ask': return '\uD83D\uDCAD' // 💭
    case 'nfl_injury_warning': return '\uD83E\uDE79' // 🩹
    case 'poll_response_milestone': return '\uD83D\uDCCA' // 📊

    // Survivor
    case 'survivor_result':
      // Correction / 'ignore the earlier notice' messages get an edit icon
      // so they don't look like another elimination on visual scan. Set
      // metadata.isCorrection=true on the server when sending one of these.
      if (n.metadata?.isCorrection) return '\u270F\uFE0F' // ✏️
      if (n.message?.includes('eliminated')) return '\u274C' // ❌
      if (n.message?.includes('lost a life')) return '\u26A0\uFE0F' // ⚠️
      return '\u2705' // ✅ survived
    case 'survivor_pick_reminder': return '\u23F0' // ⏰
    case 'survivor_win': return '\uD83D\uDC51' // 👑
    case 'league_report': return '\uD83D\uDCCB' // 📋
    case 'league_win':
      if (n.metadata?.isWinner === false && n.metadata?.points != null) {
        return n.metadata.points < 0 ? '\uD83D\uDCC9' : '\uD83D\uDCCA' // 📉 / 📊
      }
      return '\uD83C\uDFC6' // 🏆

    // Fantasy — positive
    case 'fantasy_champion': return '\uD83C\uDFC6' // 🏆
    case 'fantasy_playoff_clinched': return '\uD83C\uDF9F\uFE0F' // 🎟️
    case 'fantasy_playoff_advanced': return '\u2705' // ✅
    case 'fantasy_waiver_awarded': return '\u2705' // ✅
    case 'fantasy_trade_accepted': return '\uD83E\uDD1D' // 🤝
    case 'fantasy_trade_approved': return '\u2705' // ✅

    // Fantasy — negative
    case 'fantasy_playoff_eliminated': return '\u274C' // ❌
    case 'fantasy_playoff_missed': return '\u274C' // ❌
    case 'fantasy_trade_declined': return '\u274C' // ❌
    case 'fantasy_trade_vetoed': return '\uD83D\uDEAB' // 🚫
    case 'fantasy_league_canceled': return '\u274C' // ❌

    // Fantasy — neutral / info
    case 'fantasy_matchup_result': return '\uD83D\uDCCA' // 📊
    case 'fantasy_trade_proposed': return '\uD83D\uDD04' // 🔄
    case 'fantasy_draft_started': return '\uD83D\uDCE3' // 📣
    case 'fantasy_draft_starting_soon': return '\u23F0' // ⏰
    case 'fantasy_draft_postponed': return '\u23F8\uFE0F' // ⏸️
    case 'fantasy_draft_order_set': return '\uD83D\uDCCB' // 📋
    case 'fantasy_stat_correction': return '\uD83D\uDCDD' // 📝
    case 'fantasy_league_underfilled': return '\u26A0\uFE0F' // ⚠️
    case 'fantasy_league_member_dropped': return '\uD83D\uDC4B' // 👋
    case 'fantasy_league_resized': return '\uD83D\uDCCF' // 📏

    default:
      if (n.message?.includes('lost')) return '\u274C' // ❌
      return '\uD83C\uDFC6' // 🏆
  }
}

function getNotificationRoute(notification) {
  const { type, metadata } = notification

  // Comment/reaction notifications: deep-link to highlights with scroll target
  if (type === 'comment' || type === 'reaction') {
    // Pick/parlay/prop/hot_take comments open modals
    if (metadata?.pickId || metadata?.parlayId || metadata?.propPickId) return null
    if (metadata?.hotTakeId || (metadata?.targetType === 'hot_take' && metadata?.targetId)) return null

    // League-linked notifications (e.g. backdrop approved)
    if (metadata?.leagueId && !metadata?.targetType) return `/leagues/${metadata.leagueId}`

    // Deep-link with targetType + targetId (non-hot-take types)
    if (metadata?.targetType && metadata?.targetId) {
      return `/hub?tab=highlights&scrollTo=${metadata.targetType}-${metadata.targetId}`
    }
    // Fallback: just go to highlights tab
    return '/hub?tab=highlights'
  }

  if (metadata?.pickId) return null // handled by modal
  if (metadata?.parlayId) return null // handled by modal
  if (metadata?.propPickId) return null // handled by modal

  switch (type) {
    case 'parlay_result':
      return '/results'
    case 'futures_result':
      return null // handled by modal
    case 'streak_milestone':
      return null // handled by modal
    case 'connection_request':
    case 'hot_take_reminder':
    case 'hot_take_ask':
      return '/hub'
    case 'hot_take_callout':
      return null
    case 'direct_message':
      return '/messages'
    case 'league_invitation':
      // Deep-link straight into the league preview so the user can scope it
      // out before accepting. Falls back to the league hub if the metadata
      // is somehow missing the leagueId.
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}` : '/leagues'
    case 'invite_requested': {
      // Commissioner tapped a "user is asking to join" notification. Open
      // the league with the Invite Player modal pre-filled with the
      // requester's username so one click finishes the loop.
      if (!metadata?.leagueId) return '/leagues'
      const handle = metadata.requesterUsername
      return handle
        ? `/leagues/${metadata.leagueId}?invite=${encodeURIComponent(handle)}`
        : `/leagues/${metadata.leagueId}?invite=1`
    }
    case 'record_broken':
      return `/hall-of-fame?section=records${metadata?.recordKey ? `&record=${metadata.recordKey}` : ''}`
    case 'survivor_win':
    case 'league_win':
      return null // handled by modal
    case 'squares_quarter_win':
    case 'survivor_result':
    case 'survivor_pick_reminder':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}` : null

    // Fantasy football notifications — all route to the league with a tab hint
    case 'fantasy_trade_proposed':
    case 'fantasy_trade_accepted':
    case 'fantasy_trade_declined':
    case 'fantasy_trade_vetoed':
    case 'fantasy_trade_approved':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}?tab=Transactions&subtab=trades` : null

    case 'fantasy_draft_started':
    case 'fantasy_draft_starting_soon':
    case 'fantasy_draft_order_set':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}?tab=Draft` : null

    case 'fantasy_waiver_awarded':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}?tab=My+Team` : null
    case 'fantasy_waiver_failed':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}?tab=Players` : null

    case 'nfl_injury_warning': {
      // Writers use league_id (snake_case); accept either to remain backward compatible
      const lid = metadata?.leagueId || metadata?.league_id
      if (!lid) return null
      // Pick the right tab based on which writer fired the warning:
      //   nflInjuryWarnings.js sets source = 'traditional' | 'salary_cap'
      //   pickInjuryWarnings.js sets format = '3-Point Contest' | 'HR Derby' | etc.
      if (metadata?.source === 'salary_cap') return `/leagues/${lid}?tab=Roster`
      if (metadata?.source === 'traditional') return `/leagues/${lid}?tab=My+Team`
      if (metadata?.format === 'NBA DFS' || metadata?.format === 'MLB DFS') return `/leagues/${lid}?tab=Roster`
      if (metadata?.format) return `/leagues/${lid}?tab=Picks`
      return `/leagues/${lid}`
    }

    case 'fantasy_stat_correction':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}?tab=Live` : null

    case 'league_report':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}?tab=Report` : null

    case 'fantasy_matchup_result':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}` : null

    case 'league_thread_mention':
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}?tab=Thread` : null

    // Underfill flow notifications
    case 'fantasy_league_underfilled':
      // Commish notification → open the league so the banner / modal is visible
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}` : null
    case 'fantasy_league_resized':
      // Surviving member → take them to the league page so they see the new size
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}` : null
    case 'fantasy_league_member_dropped':
      // Dropped user → land on home where OpenLeaguesSection shows joinable leagues
      return '/'
    case 'fantasy_league_canceled':
      // All members → land on home so they can find a replacement league
      return '/'
    case 'fantasy_draft_postponed':
      // All members → open the Draft tab so they see the new countdown +
      // can share/invite without a second tap
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}?tab=Draft` : null

    case 'league_at_risk':
      // Commissioner → open the league so they can edit start date / visibility
      return metadata?.leagueId ? `/leagues/${metadata.leagueId}` : null
    case 'league_canceled_solo':
      // League is deleted — land on the home page so they can create another
      return '/'

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
  const [leagueWinData, setLeagueWinData] = useState(null)
  const [selectedHotTakeId, setSelectedHotTakeId] = useState(null)
  const [selectedStreakId, setSelectedStreakId] = useState(null)
  const [selectedFuturesPickId, setSelectedFuturesPickId] = useState(null)
  const dropdownRef = useRef(null)
  const mobileDropdownRef = useRef(null)
  const mobileMenuRef = useRef(null)
  const desktopMenuRef = useRef(null)
  const wasOpenRef = useRef(false)

  // Mark all read AS SOON AS the dropdown opens, not when it closes.
  // Closing-triggered mark-read is unreliable on iPad/iOS Safari because users
  // tap a notification → navigate → component state transitions don't fire
  // the close handler. Mark-on-open also feels snappier — the badge clears
  // immediately. Optimistic update wipes the local count even before the
  // server roundtrip lands.
  const queryClient = useQueryClient()
  useEffect(() => {
    if (showInvites) {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      // Optimistic: zero the badge instantly
      queryClient.setQueryData(['notifications', 'unread-count'], { count: 0 })
      // Server-side: persist the read state
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
  const { data: unreadMessages } = useUnreadMessageCount(isAuthenticated)

  const inviteCount = invitations?.length || 0
  const connectionCount = pendingConnections?.length || 0
  const notificationCount = unreadData?.count || 0
  const messageCount = unreadMessages?.count || 0
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
      document.addEventListener('pointerdown', handleClickOutside)
      return () => document.removeEventListener('pointerdown', handleClickOutside)
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
      document.addEventListener('pointerdown', handleClickOutside)
      return () => document.removeEventListener('pointerdown', handleClickOutside)
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
      document.addEventListener('pointerdown', handleClickOutside)
      return () => document.removeEventListener('pointerdown', handleClickOutside)
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
    const url = 'https://iknowball.club'
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'I KNOW BALL', url })
      } else if (navigator.share) {
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
    <nav className="bg-bg-secondary border-b border-border sticky top-0 z-50 touch-manipulation" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="px-4 h-14 flex items-center justify-between">
        <Link to="/" data-onboarding="home-logo" className="font-display text-xl text-accent tracking-tight">
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
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    location.pathname === link.to
                      ? 'border-accent text-accent'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l border-border">
              {/* Messages — desktop */}
              <Link
                to="/messages"
                className="relative p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Messages"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {messageCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {messageCount > 9 ? '9+' : messageCount}
                  </span>
                )}
              </Link>
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
                            {/* Tap the card to preview the league before committing.
                                The Accept/Decline buttons stop propagation so quick
                                action still works without navigating away. */}
                            <button
                              onClick={() => {
                                if (!invite.leagues?.id) return
                                setShowInvites(false)
                                setShowMobileMenu(false)
                                navigate(`/leagues/${invite.leagues.id}`)
                              }}
                              className="block w-full text-left hover:opacity-80 transition-opacity"
                            >
                              <div className="text-sm font-medium mb-1">{invite.leagues?.name}</div>
                              <div className="text-xs text-text-muted mb-2">
                                {FORMAT_LABELS[invite.leagues?.format]} · {SPORT_LABELS[invite.leagues?.sport]} · from @{invite.inviter?.username}
                              </div>
                            </button>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAccept(invite.id) }}
                                disabled={acceptInvitation.isPending}
                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDecline(invite.id) }}
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
                          const isLeagueWin = n.type === 'league_win'
                          const isSurvivorStreakEnd = n.type === 'survivor_result' && n.metadata?.streakEnded
                          const hotTakeId = n.metadata?.hotTakeId || (n.metadata?.targetType === 'hot_take' ? n.metadata.targetId : null)
                          const isStreakMilestone = n.type === 'streak_milestone' && n.metadata?.streakId
                          const tappable = n.metadata?.pickId || n.metadata?.parlayId || n.metadata?.propPickId || n.metadata?.futuresPickId || hotTakeId || isSurvivorWin || (isLeagueWin && n.metadata?.leagueId) || isSurvivorStreakEnd || isStreakMilestone || route
                          return (
                            <div
                              key={n.id}
                              className={`px-4 py-3 border-b border-border last:border-b-0${tappable ? ' cursor-pointer hover:bg-bg-card-hover transition-colors' : ''}`}
                              onClick={() => {
                                if (n.metadata?.futuresPickId) { setSelectedFuturesPickId(n.metadata.futuresPickId); setShowInvites(false) }
                                else if (n.metadata?.pickId) { setSelectedPickId(n.metadata.pickId); setShowInvites(false) }
                                else if (n.metadata?.parlayId) { setSelectedParlayId(n.metadata.parlayId); setShowInvites(false) }
                                else if (n.metadata?.propPickId) { setSelectedPropPickId(n.metadata.propPickId); setShowInvites(false) }
                                else if (isStreakMilestone) { setSelectedStreakId(n.metadata.streakId); setShowInvites(false) }
                                else if (hotTakeId) { setSelectedHotTakeId(hotTakeId); setShowInvites(false) }
                                else if (isSurvivorWin) {
                                  if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}`)
                                  setLeagueWinData({ mode: 'win', ...n.metadata })
                                  setShowInvites(false)
                                }
                                else if (isLeagueWin) {
                                  if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}?tab=Standings`)
                                  if (n.metadata?.isWinner !== false) setLeagueWinData({ mode: 'win', ...n.metadata })
                                  setShowInvites(false)
                                }
                                else if (isSurvivorStreakEnd) {
                                  if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}`)
                                  setLeagueWinData({ mode: 'streak_ended', ...n.metadata })
                                  setShowInvites(false)
                                }
                                else if (route) { navigate(route); setShowInvites(false) }
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <span className="flex-shrink-0">{getNotificationIcon(n)}</span>
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
                  className="p-2.5 -m-1 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
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
                          <Avatar user={profile} size="lg" className="bg-accent/20" />
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
                            <Avatar user={{ avatar_url: account.avatarUrl, avatar_emoji: account.avatarEmoji, username: account.username }} size="lg" className="bg-bg-secondary" />
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
                    <Link
                      to="/settings"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Profile
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
                      to="/guidelines"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      Guidelines
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

            {/* Mobile: messages + notification bell + hamburger */}
            <div className="flex items-center gap-1 md:hidden">
              {/* Messages — mobile */}
              <Link
                to="/messages"
                className="relative p-2.5 -m-0.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Messages"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {messageCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {messageCount > 9 ? '9+' : messageCount}
                  </span>
                )}
              </Link>
              {/* Notification bell — mobile */}
              <button
                onClick={() => { setShowMobileMenu(false); setShowInvites(!showInvites) }}
                className="relative p-2.5 -m-0.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
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
              <div ref={mobileMenuRef} className="relative">
                <button
                  data-onboarding="hamburger-menu"
                  onClick={() => { setShowInvites(false); if (!showMobileMenu) refreshUnreadCounts(); else resetFetchState(); setShowMobileMenu(!showMobileMenu) }}
                  className="p-2.5 -m-0.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
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
                          <Avatar user={profile} size="lg" className="bg-accent/20" />
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
                            <Avatar user={{ avatar_url: account.avatarUrl, avatar_emoji: account.avatarEmoji, username: account.username }} size="lg" className="bg-bg-secondary" />
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
                    <Link
                      to="/settings"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Profile
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
                      to="/guidelines"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-card-hover transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      Guidelines
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
                        <button
                          onClick={() => {
                            if (!invite.leagues?.id) return
                            setShowInvites(false)
                            setShowMobileMenu(false)
                            navigate(`/leagues/${invite.leagues.id}`)
                          }}
                          className="block w-full text-left hover:opacity-80 transition-opacity"
                        >
                          <div className="text-sm font-medium mb-1">{invite.leagues?.name}</div>
                          <div className="text-xs text-text-muted mb-2">
                            {FORMAT_LABELS[invite.leagues?.format]} · {SPORT_LABELS[invite.leagues?.sport]} · from @{invite.inviter?.username}
                          </div>
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAccept(invite.id) }}
                            disabled={acceptInvitation.isPending}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDecline(invite.id) }}
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
                      const isLeagueWin = n.type === 'league_win'
                      const isSurvivorStreakEnd = n.type === 'survivor_result' && n.metadata?.streakEnded
                      const isStreakMilestone = n.type === 'streak_milestone' && n.metadata?.streakId
                      const hotTakeId = n.metadata?.hotTakeId || (n.metadata?.targetType === 'hot_take' ? n.metadata.targetId : null)
                      const tappable = n.metadata?.pickId || n.metadata?.parlayId || n.metadata?.propPickId || n.metadata?.futuresPickId || hotTakeId || isSurvivorWin || isLeagueWin || isSurvivorStreakEnd || isStreakMilestone || route
                      return (
                        <div
                          key={n.id}
                          className={`px-4 py-3 border-b border-border last:border-b-0${tappable ? ' cursor-pointer hover:bg-bg-card-hover transition-colors' : ''}`}
                          onClick={() => {
                            // Mirror the desktop dropdown handler (line ~598).
                            // futuresPickId must be checked first — futures
                            // notifications also carry a pickId fallback, so
                            // dropping that branch sends a futures tap to
                            // PickDetailModal where it 404s as "Pick not found".
                            if (n.metadata?.futuresPickId) { setSelectedFuturesPickId(n.metadata.futuresPickId); setShowInvites(false) }
                            else if (n.metadata?.pickId) { setSelectedPickId(n.metadata.pickId); setShowInvites(false) }
                            else if (n.metadata?.parlayId) { setSelectedParlayId(n.metadata.parlayId); setShowInvites(false) }
                            else if (n.metadata?.propPickId) { setSelectedPropPickId(n.metadata.propPickId); setShowInvites(false) }
                            else if (isStreakMilestone) { setSelectedStreakId(n.metadata.streakId); setShowInvites(false) }
                            else if (hotTakeId) { setSelectedHotTakeId(hotTakeId); setShowInvites(false) }
                            else if (isSurvivorWin) {
                              if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}`)
                              setLeagueWinData({ mode: 'win', ...n.metadata })
                              setShowInvites(false)
                            }
                            else if (isLeagueWin) {
                              if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}?tab=Standings`)
                              if (n.metadata?.isWinner !== false) setLeagueWinData({ mode: 'win', ...n.metadata })
                              setShowInvites(false)
                            }
                            else if (isSurvivorStreakEnd) {
                              if (n.metadata?.leagueId) navigate(`/leagues/${n.metadata.leagueId}`)
                              setLeagueWinData({ mode: 'streak_ended', ...n.metadata })
                              setShowInvites(false)
                            }
                            else if (route) { navigate(route); setShowInvites(false) }
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <span className="flex-shrink-0">{getNotificationIcon(n)}</span>
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

        {/* Auth links moved to hero CTA on landing page */}
      </div>
    </nav>
    <PickDetailModal pickId={selectedPickId} onClose={() => setSelectedPickId(null)} />
    <ParlayResultModal parlayId={selectedParlayId} onClose={() => setSelectedParlayId(null)} />
    <PropDetailModal propPickId={selectedPropPickId} onClose={() => setSelectedPropPickId(null)} />
    <LeagueWinModal data={leagueWinData} onClose={() => setLeagueWinData(null)} />
    <HotTakeDetailModal hotTakeId={selectedHotTakeId} onClose={() => setSelectedHotTakeId(null)} />
    <StreakDetailModal streakId={selectedStreakId} onClose={() => setSelectedStreakId(null)} />
    <FuturesHitModalWrapper futuresPickId={selectedFuturesPickId} onClose={() => setSelectedFuturesPickId(null)} />
    </>
  )
}
