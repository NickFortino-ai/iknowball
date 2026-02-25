import { useNavigate } from 'react-router-dom'
import { useRoyalty } from '../hooks/useRecords'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import TierBadge from '../components/ui/TierBadge'
import SocialLinks from '../components/ui/SocialLinks'

function CrownSVG({ size = 'lg' }) {
  const dims = size === 'lg' ? 64 : 32
  return (
    <svg width={dims} height={dims} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 48h48L52 20l-12 12-8-16-8 16-12-12L8 48z"
        fill="url(#crown-gradient)"
        stroke="#B8860B"
        strokeWidth="2"
      />
      <circle cx="8" cy="20" r="4" fill="#FFD700" />
      <circle cx="56" cy="20" r="4" fill="#FFD700" />
      <circle cx="32" cy="16" r="4" fill="#FFD700" />
      <circle cx="20" cy="32" r="4" fill="#FFD700" />
      <circle cx="44" cy="32" r="4" fill="#FFD700" />
      <rect x="6" y="48" width="52" height="6" rx="2" fill="url(#crown-gradient)" stroke="#B8860B" strokeWidth="1" />
      <defs>
        <linearGradient id="crown-gradient" x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD700" />
          <stop offset="1" stopColor="#B8860B" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function SmallCrownSVG() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 48h48L52 20l-12 12-8-16-8 16-12-12L8 48z"
        fill="url(#crown-sm-gradient)"
        stroke="#B8860B"
        strokeWidth="2.5"
      />
      <circle cx="8" cy="20" r="4" fill="#FFD700" />
      <circle cx="56" cy="20" r="4" fill="#FFD700" />
      <circle cx="32" cy="16" r="4" fill="#FFD700" />
      <rect x="6" y="48" width="52" height="6" rx="2" fill="url(#crown-sm-gradient)" stroke="#B8860B" strokeWidth="1.5" />
      <defs>
        <linearGradient id="crown-sm-gradient" x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD700" />
          <stop offset="1" stopColor="#DAA520" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function GlobalCrownCard({ crown }) {
  const navigate = useNavigate()
  if (!crown) return null

  const holder = crown.holder
  const joinDate = holder.created_at ? new Date(holder.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null

  return (
    <div
      className="bg-bg-card border-2 border-[#FFD700]/40 rounded-2xl p-6 text-center cursor-pointer hover:border-[#FFD700]/60 transition-colors"
      onClick={() => navigate(`/profile?user=${holder.id}`)}
    >
      <div className="flex justify-center mb-3">
        <CrownSVG size="lg" />
      </div>
      <h2 className="font-display text-lg text-[#FFD700] mb-4">The Crown of I KNOW BALL</h2>

      <div className="flex justify-center mb-3">
        <span className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-2xl">
          {holder.avatar_emoji || holder.display_name?.[0]?.toUpperCase() || holder.username?.[0]?.toUpperCase()}
        </span>
      </div>

      <div className="font-semibold text-lg text-text-primary">{holder.display_name || holder.username}</div>
      <div className="text-sm text-text-muted mb-2">@{holder.username}</div>

      <div className="flex items-center justify-center gap-2 mb-3">
        <TierBadge tier={holder.tier} size="sm" />
        <span className="text-sm font-semibold text-accent">{crown.points?.toLocaleString()} pts</span>
      </div>

      {joinDate && (
        <div className="text-xs text-text-muted mb-2">Member since {joinDate}</div>
      )}

      <div className="flex justify-center">
        <SocialLinks user={holder} />
      </div>
    </div>
  )
}

function CrownCard({ crown }) {
  const navigate = useNavigate()
  if (!crown) return null

  const holder = crown.holder

  return (
    <div
      className="bg-bg-card border border-border rounded-2xl p-4 cursor-pointer hover:border-[#FFD700]/40 transition-colors"
      onClick={() => navigate(`/profile?user=${holder.id}`)}
    >
      <div className="flex items-center gap-2 mb-3">
        <SmallCrownSVG />
        <h3 className="font-semibold text-sm text-[#DAA520]">{crown.scope}</h3>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-sm flex-shrink-0">
          {holder.avatar_emoji || holder.display_name?.[0]?.toUpperCase() || holder.username?.[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm text-text-primary truncate">{holder.display_name || holder.username}</div>
          <div className="flex items-center gap-1.5">
            <TierBadge tier={holder.tier} size="xs" />
            {crown.points != null && (
              <span className="text-xs text-text-muted">{crown.points?.toLocaleString()} pts</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RoyaltyPage() {
  const { data: royalty, isLoading, isError, refetch } = useRoyalty()

  const secondaryCrowns = [
    ...(royalty?.sportCrowns || []),
    royalty?.propCrown,
    royalty?.parlayCrown,
  ].filter(Boolean)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-2">IKB Royalty</h1>
      <p className="text-sm text-text-muted mb-6">The #1 on every leaderboard</p>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState title="Failed to load royalty" message="Check your connection and try again." onRetry={refetch} />
      ) : !royalty?.globalCrown ? (
        <EmptyState title="No crowns yet" message="Crowns will appear once the leaderboard has data." />
      ) : (
        <div className="space-y-6">
          <GlobalCrownCard crown={royalty.globalCrown} />

          {secondaryCrowns.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                Category Crowns
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {secondaryCrowns.map((crown, i) => (
                  <CrownCard key={crown.scope || i} crown={crown} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
