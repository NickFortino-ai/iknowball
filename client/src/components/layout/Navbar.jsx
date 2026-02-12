import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getTier } from '../../lib/scoring'
import TierBadge from '../ui/TierBadge'

const navLinks = [
  { to: '/picks', label: 'Picks' },
  { to: '/results', label: 'Results' },
  { to: '/leaderboard', label: 'Board' },
]

export default function Navbar() {
  const { isAuthenticated, profile, signOut } = useAuth()
  const location = useLocation()

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
              {profile && (
                <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <TierBadge tier={getTier(profile.total_points).name} size="xs" />
                  <span className="text-sm text-text-secondary hidden sm:inline">{profile.username}</span>
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
