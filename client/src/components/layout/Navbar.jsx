import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useMyInvitations, useAcceptInvitation, useDeclineInvitation } from '../../hooks/useInvitations'
import { getTier } from '../../lib/scoring'
import TierBadge from '../ui/TierBadge'
import { toast } from '../ui/Toast'

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  americanfootball_ncaaf: 'NCAAF',
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
]

export default function Navbar() {
  const { isAuthenticated, profile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showInvites, setShowInvites] = useState(false)
  const dropdownRef = useRef(null)

  const { data: invitations } = useMyInvitations(isAuthenticated)
  const acceptInvitation = useAcceptInvitation()
  const declineInvitation = useDeclineInvitation()

  const pendingCount = invitations?.length || 0

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowInvites(false)
      }
    }
    if (showInvites) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showInvites])

  async function handleAccept(invitationId) {
    try {
      const result = await acceptInvitation.mutateAsync(invitationId)
      toast('Joined league!', 'success')
      setShowInvites(false)
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

  return (
    <nav className="bg-bg-secondary border-b border-border sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-display text-xl text-accent tracking-tight">
          I KNOW BALL
        </Link>

        {isAuthenticated && (
          <div className="flex items-center gap-1 sm:gap-4">
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

            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
              {/* Notification Bell */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowInvites(!showInvites)}
                  className="relative p-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                  aria-label="Invitations"
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

                {/* Invitations Dropdown */}
                {showInvites && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <h3 className="font-semibold text-sm">Invitations</h3>
                    </div>

                    {pendingCount === 0 ? (
                      <div className="px-4 py-6 text-center text-text-muted text-sm">
                        No pending invitations
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        {invitations.map((invite) => (
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
                      </div>
                    )}
                  </div>
                )}
              </div>

              {profile && (
                <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <TierBadge tier={getTier(profile.total_points).name} size="xs" />
                  <span className="text-sm text-text-secondary hidden sm:inline">{profile.username}</span>
                </Link>
              )}
              {profile?.is_admin && (
                <Link
                  to="/admin"
                  className={`text-xs transition-colors ${location.pathname === '/admin' ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
                >
                  Admin
                </Link>
              )}
              <Link
                to="/settings"
                className={`text-xs transition-colors ${location.pathname === '/settings' ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
              >
                Settings
              </Link>
              <button
                onClick={signOut}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Out
              </button>
            </div>
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
  )
}
