import { useNavigate } from 'react-router-dom'
import { useRoyalty } from '../hooks/useRecords'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import TierBadge from '../components/ui/TierBadge'

function CrownSVG({ size = 80, id = 'crown' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}-gold`} x1="60" y1="0" x2="60" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF0A0" />
          <stop offset="0.3" stopColor="#FFD700" />
          <stop offset="0.6" stopColor="#DAA520" />
          <stop offset="1" stopColor="#B8860B" />
        </linearGradient>
        <linearGradient id={`${id}-gold-light`} x1="60" y1="0" x2="60" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFEC80" />
          <stop offset="1" stopColor="#FFD700" />
        </linearGradient>
        <radialGradient id={`${id}-jewel`} cx="50%" cy="40%" r="50%">
          <stop offset="0" stopColor="#FF6B6B" />
          <stop offset="0.5" stopColor="#DC143C" />
          <stop offset="1" stopColor="#8B0000" />
        </radialGradient>
        <radialGradient id={`${id}-sparkle`} cx="30%" cy="30%" r="50%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Crown body */}
      <path
        d="M10 72 L2 25 Q2 22 5 23 L25 38 Q28 40 30 37 L55 8 Q58 4 62 8 L88 37 Q90 40 93 38 L113 23 Q116 22 116 25 L108 72 Z"
        fill={`url(#${id}-gold)`}
        stroke="#B8860B"
        strokeWidth="1.5"
      />

      {/* Inner velvet */}
      <path
        d="M18 68 L12 32 L30 44 L58 14 L88 44 L106 32 L100 68 Z"
        fill="#8B0000"
        opacity="0.4"
      />

      {/* Crown band */}
      <rect x="8" y="68" width="102" height="14" rx="3" fill={`url(#${id}-gold)`} stroke="#B8860B" strokeWidth="1" />
      <rect x="10" y="70" width="98" height="10" rx="2" fill={`url(#${id}-gold-light)`} opacity="0.5" />

      {/* Band decorative dots */}
      <circle cx="30" cy="75" r="2" fill="#B8860B" opacity="0.5" />
      <circle cx="45" cy="75" r="2" fill="#B8860B" opacity="0.5" />
      <circle cx="75" cy="75" r="2" fill="#B8860B" opacity="0.5" />
      <circle cx="90" cy="75" r="2" fill="#B8860B" opacity="0.5" />

      {/* Center jewel (large) */}
      <ellipse cx="59" cy="50" rx="8" ry="9" fill={`url(#${id}-jewel)`} stroke="#B8860B" strokeWidth="1" />
      <ellipse cx="56" cy="46" rx="3" ry="2.5" fill={`url(#${id}-sparkle)`} />

      {/* Left jewel */}
      <circle cx="32" cy="55" r="5.5" fill={`url(#${id}-jewel)`} stroke="#B8860B" strokeWidth="1" />
      <circle cx="30" cy="53" r="2" fill={`url(#${id}-sparkle)`} />

      {/* Right jewel */}
      <circle cx="86" cy="55" r="5.5" fill={`url(#${id}-jewel)`} stroke="#B8860B" strokeWidth="1" />
      <circle cx="84" cy="53" r="2" fill={`url(#${id}-sparkle)`} />

      {/* Band center jewel */}
      <ellipse cx="59" cy="75" rx="5" ry="4.5" fill={`url(#${id}-jewel)`} stroke="#B8860B" strokeWidth="0.8" />
      <ellipse cx="57" cy="73" rx="2" ry="1.5" fill={`url(#${id}-sparkle)`} />

      {/* Top prong tips — fleur-de-lis style */}
      {/* Center tip */}
      <ellipse cx="58" cy="9" rx="4" ry="5" fill={`url(#${id}-gold-light)`} stroke="#B8860B" strokeWidth="0.8" />
      <circle cx="58" cy="7" r="2.5" fill={`url(#${id}-jewel)`} />
      <circle cx="57" cy="6" r="1" fill={`url(#${id}-sparkle)`} />

      {/* Left tip */}
      <ellipse cx="5" cy="24" rx="4" ry="4.5" fill={`url(#${id}-gold-light)`} stroke="#B8860B" strokeWidth="0.8" />
      <circle cx="5" cy="23" r="2.2" fill={`url(#${id}-jewel)`} />

      {/* Right tip */}
      <ellipse cx="113" cy="24" rx="4" ry="4.5" fill={`url(#${id}-gold-light)`} stroke="#B8860B" strokeWidth="0.8" />
      <circle cx="113" cy="23" r="2.2" fill={`url(#${id}-jewel)`} />

      {/* Subtle gold shimmer highlights */}
      <path d="M20 40 Q40 35 50 42" stroke="#FFF8C0" strokeWidth="0.8" opacity="0.5" fill="none" />
      <path d="M68 42 Q78 35 98 40" stroke="#FFF8C0" strokeWidth="0.8" opacity="0.5" fill="none" />

      {/* Shadow/reflection */}
      <ellipse cx="59" cy="92" rx="40" ry="4" fill="#FFD700" opacity="0.08" />
    </svg>
  )
}

function SmallCrownSVG({ id = 'sm-crown' }) {
  return <CrownSVG size={44} id={id} />
}

function GlobalCrown({ crown }) {
  const navigate = useNavigate()
  if (!crown) return null

  const holder = crown.holder
  const title = holder.title_preference === 'queen' ? 'Queen' : 'King'

  return (
    <div
      className="text-center py-8 cursor-pointer group"
      onClick={() => navigate(`/profile?user=${holder.id}`)}
    >
      <div className="flex justify-center mb-4">
        <CrownSVG size={100} id="global-crown" />
      </div>
      <h2 className="font-display text-lg text-[#FFD700] mb-4 tracking-wide">The {title} of I KNOW BALL</h2>

      <div className="flex justify-center mb-2">
        <span className="w-14 h-14 rounded-full bg-[#FFD700]/10 flex items-center justify-center text-xl border border-[#FFD700]/20">
          {holder.avatar_emoji || holder.display_name?.[0]?.toUpperCase() || holder.username?.[0]?.toUpperCase()}
        </span>
      </div>

      <div className="font-semibold text-lg text-text-primary group-hover:text-[#FFD700] transition-colors">
        {holder.display_name || holder.username}
      </div>
      <div className="flex items-center justify-center gap-2 mt-1">
        <TierBadge tier={holder.tier} size="xs" />
        <span className="text-sm text-[#DAA520]">{crown.points?.toLocaleString()} pts</span>
      </div>
    </div>
  )
}

function CategoryCrown({ crown, index }) {
  const navigate = useNavigate()
  if (!crown) return null

  const holder = crown.holder

  return (
    <div
      className="text-center py-5 cursor-pointer group"
      onClick={() => navigate(`/profile?user=${holder.id}`)}
    >
      <div className="flex justify-center mb-2">
        <SmallCrownSVG id={`cat-crown-${index}`} />
      </div>
      <div className="text-xs font-semibold text-[#DAA520] uppercase tracking-wider mb-2">{crown.scope}</div>
      <div className="flex justify-center mb-1">
        <span className="w-8 h-8 rounded-full bg-[#FFD700]/10 flex items-center justify-center text-xs border border-[#FFD700]/15">
          {holder.avatar_emoji || holder.display_name?.[0]?.toUpperCase() || holder.username?.[0]?.toUpperCase()}
        </span>
      </div>
      <div className="text-sm font-medium text-text-primary group-hover:text-[#FFD700] transition-colors truncate">
        {holder.display_name || holder.username}
      </div>
      {crown.points != null && (
        <div className="text-xs text-text-muted mt-0.5">{crown.points?.toLocaleString()} pts</div>
      )}
    </div>
  )
}

export function RoyaltyContent() {
  const { data: royalty, isLoading, isError, refetch } = useRoyalty()

  const secondaryCrowns = [
    ...(royalty?.sportCrowns || []),
    royalty?.propCrown,
    royalty?.parlayCrown,
  ].filter(Boolean)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState title="Failed to load royalty" message="Check your connection and try again." onRetry={refetch} />
  if (!royalty?.globalCrown) return <EmptyState title="No crowns yet" message="Crowns will appear once the leaderboard has data." />

  return (
    <div>
      <GlobalCrown crown={royalty.globalCrown} />

      {secondaryCrowns.length > 0 && (
        <>
          <div className="border-t border-border/50 my-2" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2">
            {secondaryCrowns.map((crown, i) => (
              <CategoryCrown key={crown.scope || i} crown={crown} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function RoyaltyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-1">IKB Royalty</h1>
      <p className="text-sm text-text-muted mb-2">The #1 on every leaderboard</p>
      <RoyaltyContent />
    </div>
  )
}
