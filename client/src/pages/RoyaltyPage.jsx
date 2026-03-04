import { useState } from 'react'
import { useRoyalty } from '../hooks/useRecords'
import UserProfileModal from '../components/profile/UserProfileModal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import TierBadge from '../components/ui/TierBadge'
import Avatar from '../components/ui/Avatar'

const JEWEL_THEMES = {
  default:   { light: '#FF4D6A', mid: '#DC143C', dark: '#A0001C', deep: '#700014', glow: '#FF2040' },
  NBA:       { light: '#FF8844', mid: '#E85D20', dark: '#B84010', deep: '#7A2A08', glow: '#FF6020' },
  NFL:       { light: '#44BBFF', mid: '#1E90FF', dark: '#1060C0', deep: '#083880', glow: '#2090FF' },
  MLB:       { light: '#FF4D6A', mid: '#DC143C', dark: '#A0001C', deep: '#700014', glow: '#FF2040' },
  NHL:       { light: '#A070FF', mid: '#7B42E0', dark: '#5520A0', deep: '#350E6B', glow: '#8040FF' },
  Props:     { light: '#50E8A0', mid: '#20C070', dark: '#108848', deep: '#06582C', glow: '#30D080' },
  Parlays:   { light: '#FFD060', mid: '#E8A820', dark: '#B88010', deep: '#7A5508', glow: '#F0B020' },
}

function getJewelTheme(scope) {
  if (!scope) return JEWEL_THEMES.default
  for (const key of Object.keys(JEWEL_THEMES)) {
    if (scope.toLowerCase().includes(key.toLowerCase())) return JEWEL_THEMES[key]
  }
  return JEWEL_THEMES.default
}

function CrownSVG({ size = 80, id = 'crown', animate = false, jewel }) {
  const j = jewel || JEWEL_THEMES.default
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={animate ? 'crown-glow' : ''}
    >
      <defs>
        <linearGradient id={`${id}-gold`} x1="20" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF6C2" />
          <stop offset="0.25" stopColor="#FFD700" />
          <stop offset="0.5" stopColor="#F5C400" />
          <stop offset="0.75" stopColor="#DAA520" />
          <stop offset="1" stopColor="#B8860B" />
        </linearGradient>
        <linearGradient id={`${id}-gold-highlight`} x1="40" y1="0" x2="80" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFBE0" />
          <stop offset="0.5" stopColor="#FFE766" />
          <stop offset="1" stopColor="#FFD700" />
        </linearGradient>
        <linearGradient id={`${id}-band`} x1="60" y1="68" x2="60" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE766" />
          <stop offset="0.4" stopColor="#FFD700" />
          <stop offset="1" stopColor="#C8960C" />
        </linearGradient>
        <radialGradient id={`${id}-jewel`} cx="40%" cy="35%" r="55%">
          <stop offset="0" stopColor={j.light} />
          <stop offset="0.4" stopColor={j.mid} />
          <stop offset="0.8" stopColor={j.dark} />
          <stop offset="1" stopColor={j.deep} />
        </radialGradient>
        <radialGradient id={`${id}-sparkle`} cx="30%" cy="25%" r="45%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#FFD700" floodOpacity="0.3" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${id}-jewel-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feFlood floodColor={j.glow} floodOpacity="0.4" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow aura */}
      <path
        d="M10 72 L2 25 Q2 22 5 23 L25 38 Q28 40 30 37 L55 8 Q58 4 62 8 L88 37 Q90 40 93 38 L113 23 Q116 22 116 25 L108 72 Z"
        fill="#FFD700"
        opacity="0.12"
        filter={`url(#${id}-glow)`}
      />

      {/* Crown body */}
      <path
        d="M10 72 L2 25 Q2 22 5 23 L25 38 Q28 40 30 37 L55 8 Q58 4 62 8 L88 37 Q90 40 93 38 L113 23 Q116 22 116 25 L108 72 Z"
        fill={`url(#${id}-gold)`}
        stroke="#B8860B"
        strokeWidth="1.2"
      />

      {/* Inner velvet with gradient feel */}
      <path
        d="M18 68 L12 32 L30 44 L58 14 L88 44 L106 32 L100 68 Z"
        fill="#6B0015"
        opacity="0.35"
      />
      <path
        d="M22 66 L16 36 L30 46 L58 18 L88 46 L102 36 L98 66 Z"
        fill="#400010"
        opacity="0.2"
      />

      {/* Left face highlight */}
      <path
        d="M10 72 L2 25 Q2 22 5 23 L25 38 L18 68 Z"
        fill="#FFF8D0"
        opacity="0.15"
      />

      {/* Crown band */}
      <rect x="8" y="68" width="102" height="14" rx="3" fill={`url(#${id}-band)`} stroke="#B8860B" strokeWidth="1" />
      <rect x="10" y="69" width="98" height="6" rx="2" fill={`url(#${id}-gold-highlight)`} opacity="0.35" />

      {/* Band filigree pattern */}
      <path d="M20 75 Q27 71 34 75 Q41 79 48 75" stroke="#B8860B" strokeWidth="0.6" opacity="0.4" fill="none" />
      <path d="M70 75 Q77 71 84 75 Q91 79 98 75" stroke="#B8860B" strokeWidth="0.6" opacity="0.4" fill="none" />

      {/* Center jewel (large) */}
      <g filter={`url(#${id}-jewel-glow)`}>
        <ellipse cx="59" cy="50" rx="8" ry="9" fill={`url(#${id}-jewel)`} stroke="#C8960C" strokeWidth="1.2" />
      </g>
      <ellipse cx="55.5" cy="45.5" rx="3" ry="2.5" fill={`url(#${id}-sparkle)`} />
      <ellipse cx="62" cy="54" rx="1.5" ry="1" fill="white" opacity="0.15" />

      {/* Left jewel */}
      <g filter={`url(#${id}-jewel-glow)`}>
        <circle cx="32" cy="55" r="5.5" fill={`url(#${id}-jewel)`} stroke="#C8960C" strokeWidth="1" />
      </g>
      <circle cx="29.5" cy="52.5" r="2" fill={`url(#${id}-sparkle)`} />

      {/* Right jewel */}
      <g filter={`url(#${id}-jewel-glow)`}>
        <circle cx="86" cy="55" r="5.5" fill={`url(#${id}-jewel)`} stroke="#C8960C" strokeWidth="1" />
      </g>
      <circle cx="83.5" cy="52.5" r="2" fill={`url(#${id}-sparkle)`} />

      {/* Band center jewel */}
      <g filter={`url(#${id}-jewel-glow)`}>
        <ellipse cx="59" cy="75" rx="5" ry="4.5" fill={`url(#${id}-jewel)`} stroke="#C8960C" strokeWidth="0.8" />
      </g>
      <ellipse cx="56.5" cy="72.5" rx="2" ry="1.5" fill={`url(#${id}-sparkle)`} />

      {/* Top prong tips */}
      {/* Center tip */}
      <ellipse cx="58" cy="9" rx="4.5" ry="5.5" fill={`url(#${id}-gold-highlight)`} stroke="#B8860B" strokeWidth="0.8" />
      <circle cx="58" cy="7" r="2.8" fill={`url(#${id}-jewel)`} />
      <circle cx="56.5" cy="5.5" r="1.1" fill={`url(#${id}-sparkle)`} />

      {/* Left tip */}
      <ellipse cx="5" cy="24" rx="4.5" ry="5" fill={`url(#${id}-gold-highlight)`} stroke="#B8860B" strokeWidth="0.8" />
      <circle cx="5" cy="23" r="2.5" fill={`url(#${id}-jewel)`} />
      <circle cx="3.8" cy="21.8" r="0.9" fill={`url(#${id}-sparkle)`} />

      {/* Right tip */}
      <ellipse cx="113" cy="24" rx="4.5" ry="5" fill={`url(#${id}-gold-highlight)`} stroke="#B8860B" strokeWidth="0.8" />
      <circle cx="113" cy="23" r="2.5" fill={`url(#${id}-jewel)`} />
      <circle cx="111.8" cy="21.8" r="0.9" fill={`url(#${id}-sparkle)`} />

      {/* Gold highlight streaks */}
      <path d="M16 45 Q35 38 48 45" stroke="#FFF8D0" strokeWidth="0.7" opacity="0.45" fill="none" />
      <path d="M70 45 Q85 38 102 45" stroke="#FFF8D0" strokeWidth="0.7" opacity="0.45" fill="none" />
      <path d="M30 62 Q45 58 58 62" stroke="#FFFBE0" strokeWidth="0.5" opacity="0.3" fill="none" />
      <path d="M60 62 Q75 58 88 62" stroke="#FFFBE0" strokeWidth="0.5" opacity="0.3" fill="none" />

      {/* Edge shimmer sparkles */}
      {animate && (
        <>
          {/* Left prong tip sparkle */}
          <circle cx="5" cy="19" r="2.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.7;0" dur="3s" begin="0s" repeatCount="indefinite" />
            <animate attributeName="r" values="1.5;3;1.5" dur="3s" begin="0s" repeatCount="indefinite" />
          </circle>
          {/* Center prong tip sparkle */}
          <circle cx="58" cy="4" r="2.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.8;0" dur="3.5s" begin="1.2s" repeatCount="indefinite" />
            <animate attributeName="r" values="1.5;3.5;1.5" dur="3.5s" begin="1.2s" repeatCount="indefinite" />
          </circle>
          {/* Right prong tip sparkle */}
          <circle cx="113" cy="19" r="2.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.7;0" dur="3s" begin="2s" repeatCount="indefinite" />
            <animate attributeName="r" values="1.5;3;1.5" dur="3s" begin="2s" repeatCount="indefinite" />
          </circle>
          {/* Left edge highlight */}
          <path d="M3 28 L10 68" stroke="#FFFBE0" strokeWidth="1" opacity="0" strokeLinecap="round">
            <animate attributeName="opacity" values="0;0.4;0" dur="4s" begin="0.5s" repeatCount="indefinite" />
          </path>
          {/* Right edge highlight */}
          <path d="M115 28 L108 68" stroke="#FFFBE0" strokeWidth="1" opacity="0" strokeLinecap="round">
            <animate attributeName="opacity" values="0;0.4;0" dur="4s" begin="2.5s" repeatCount="indefinite" />
          </path>
          {/* Band edge glint */}
          <rect x="8" y="69" width="6" height="3" rx="1.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.5;0" dur="2.5s" begin="1.8s" repeatCount="indefinite" />
          </rect>
          <rect x="104" y="69" width="6" height="3" rx="1.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.5;0" dur="2.5s" begin="0.8s" repeatCount="indefinite" />
          </rect>
        </>
      )}
    </svg>
  )
}

function SmallCrownSVG({ id = 'sm-crown', jewel }) {
  return <CrownSVG size={44} id={id} jewel={jewel} />
}

function GlobalCrown({ crown, onUserTap }) {
  if (!crown) return null

  const holder = crown.holder
  const title = holder.title_preference === 'queen' ? 'Queen' : 'King'

  return (
    <div
      className="text-center py-8 cursor-pointer group"
      onClick={() => onUserTap?.(holder.id)}
    >
      <div className="flex justify-center mb-4">
        <CrownSVG size={100} id="global-crown" animate />
      </div>
      <h2 className="font-display text-lg text-[#FFD700] mb-4 tracking-wide">The {title} of I KNOW BALL</h2>

      <div className="flex justify-center mb-2">
        <Avatar user={holder} size="2xl" className="bg-[#FFD700]/10 border border-[#FFD700]/20" />
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

function CategoryCrown({ crown, index, onUserTap }) {
  if (!crown) return null

  const holder = crown.holder

  return (
    <div
      className="text-center py-5 cursor-pointer group"
      onClick={() => onUserTap?.(holder.id)}
    >
      <div className="flex justify-center mb-2">
        <SmallCrownSVG id={`cat-crown-${index}`} jewel={getJewelTheme(crown.scope)} />
      </div>
      <div className="text-xs font-semibold text-[#DAA520] uppercase tracking-wider mb-2">{crown.scope}</div>
      <div className="flex justify-center mb-1">
        <Avatar user={holder} size="lg" className="bg-[#FFD700]/10 border border-[#FFD700]/15" />
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
  const [profileUserId, setProfileUserId] = useState(null)

  const secondaryCrowns = [
    ...(royalty?.sportCrowns || []),
    royalty?.propCrown,
    royalty?.parlayCrown,
  ].filter(Boolean)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState title="Failed to load royalty" message="Check your connection and try again." onRetry={refetch} />
  if (!royalty?.globalCrown) return <EmptyState title="No crowns yet" message="Crowns will appear once the leaderboard has data." />

  return (
    <>
      <div>
        <GlobalCrown crown={royalty.globalCrown} onUserTap={setProfileUserId} />

        {secondaryCrowns.length > 0 && (
          <>
            <div className="border-t border-border/50 my-2" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2">
              {secondaryCrowns.map((crown, i) => (
                <CategoryCrown key={crown.scope || i} crown={crown} index={i} onUserTap={setProfileUserId} />
              ))}
            </div>
          </>
        )}
      </div>
      <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </>
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
