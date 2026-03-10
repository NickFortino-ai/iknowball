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
        {/* Primary gold - rich metallic with multiple stops */}
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="120" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF6C2" />
          <stop offset="0.15" stopColor="#FFE066" />
          <stop offset="0.35" stopColor="#FFD700" />
          <stop offset="0.55" stopColor="#DAA520" />
          <stop offset="0.75" stopColor="#C8960C" />
          <stop offset="1" stopColor="#A07008" />
        </linearGradient>
        {/* Left-lit face for 3D depth */}
        <linearGradient id={`${id}-gold-left`} x1="0" y1="30" x2="60" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFBE6" />
          <stop offset="0.4" stopColor="#FFE066" />
          <stop offset="1" stopColor="#DAA520" />
        </linearGradient>
        {/* Right shadow face */}
        <linearGradient id={`${id}-gold-right`} x1="60" y1="30" x2="120" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#DAA520" />
          <stop offset="0.5" stopColor="#B8860B" />
          <stop offset="1" stopColor="#8B6914" />
        </linearGradient>
        <linearGradient id={`${id}-gold-highlight`} x1="40" y1="0" x2="80" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFBE0" />
          <stop offset="0.5" stopColor="#FFE766" />
          <stop offset="1" stopColor="#FFD700" />
        </linearGradient>
        {/* Band gradient - polished metal look */}
        <linearGradient id={`${id}-band`} x1="60" y1="66" x2="60" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE880" />
          <stop offset="0.2" stopColor="#FFD700" />
          <stop offset="0.5" stopColor="#DAA520" />
          <stop offset="0.8" stopColor="#C8960C" />
          <stop offset="1" stopColor="#A07008" />
        </linearGradient>
        {/* Band top highlight strip */}
        <linearGradient id={`${id}-band-shine`} x1="10" y1="68" x2="108" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD700" stopOpacity="0" />
          <stop offset="0.3" stopColor="#FFFBE0" stopOpacity="0.6" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="0.7" stopColor="#FFFBE0" stopOpacity="0.6" />
          <stop offset="1" stopColor="#FFD700" stopOpacity="0" />
        </linearGradient>
        {/* Jewel gradient with more facet-like stops */}
        <radialGradient id={`${id}-jewel`} cx="38%" cy="32%" r="60%">
          <stop offset="0" stopColor={j.light} />
          <stop offset="0.3" stopColor={j.mid} />
          <stop offset="0.7" stopColor={j.dark} />
          <stop offset="1" stopColor={j.deep} />
        </radialGradient>
        {/* Secondary jewel highlight for facet effect */}
        <radialGradient id={`${id}-jewel-facet`} cx="65%" cy="70%" r="40%">
          <stop offset="0" stopColor={j.light} stopOpacity="0.4" />
          <stop offset="1" stopColor={j.deep} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-sparkle`} cx="30%" cy="25%" r="45%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        {/* Velvet interior */}
        <linearGradient id={`${id}-velvet`} x1="59" y1="14" x2="59" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2A0008" />
          <stop offset="0.5" stopColor="#4A0012" />
          <stop offset="1" stopColor="#600018" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#FFD700" floodOpacity="0.25" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${id}-jewel-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feFlood floodColor={j.glow} floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Drop shadow for depth */}
        <filter id={`${id}-shadow`} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Subtle glow aura behind crown */}
      <path
        d="M10 72 L2 25 Q2 22 5 23 L25 38 Q28 40 30 37 L55 8 Q58 4 62 8 L88 37 Q90 40 93 38 L113 23 Q116 22 116 25 L108 72 Z"
        fill="#FFD700"
        opacity="0.08"
        filter={`url(#${id}-glow)`}
      />

      {/* Crown body - base gold */}
      <path
        d="M10 72 L2 25 Q2 22 5 23 L25 38 Q28 40 30 37 L55 8 Q58 4 62 8 L88 37 Q90 40 93 38 L113 23 Q116 22 116 25 L108 72 Z"
        fill={`url(#${id}-gold)`}
        stroke="#8B6914"
        strokeWidth="0.8"
        filter={`url(#${id}-shadow)`}
      />

      {/* Left face - lit highlight for 3D */}
      <path
        d="M10 72 L2 25 Q2 22 5 23 L25 38 Q28 40 30 37 L55 8 Q58 4 58 8 L30 44 L18 68 Z"
        fill={`url(#${id}-gold-left)`}
        opacity="0.4"
      />

      {/* Right face - shadow for 3D */}
      <path
        d="M108 72 L116 25 Q116 22 113 23 L93 38 Q90 40 88 37 L62 8 Q58 4 58 8 L88 44 L100 68 Z"
        fill={`url(#${id}-gold-right)`}
        opacity="0.35"
      />

      {/* Velvet interior */}
      <path
        d="M18 68 L12 32 L30 44 L58 14 L88 44 L106 32 L100 68 Z"
        fill={`url(#${id}-velvet)`}
        opacity="0.45"
      />

      {/* Interior fabric texture lines */}
      <path d="M40 30 L38 65" stroke="#80002A" strokeWidth="0.3" opacity="0.25" />
      <path d="M50 22 L48 65" stroke="#80002A" strokeWidth="0.3" opacity="0.2" />
      <path d="M68 22 L70 65" stroke="#80002A" strokeWidth="0.3" opacity="0.2" />
      <path d="M78 30 L80 65" stroke="#80002A" strokeWidth="0.3" opacity="0.25" />

      {/* Crown edge bevel highlights */}
      <path
        d="M10 72 L2 25 Q2 22 5 23 L25 38"
        fill="none" stroke="#FFFBE0" strokeWidth="0.6" opacity="0.5"
      />
      <path
        d="M30 37 L55 8 Q58 4 62 8 L88 37"
        fill="none" stroke="#FFFBE0" strokeWidth="0.5" opacity="0.35"
      />

      {/* Crown band - polished */}
      <rect x="8" y="68" width="102" height="14" rx="3" fill={`url(#${id}-band)`} stroke="#8B6914" strokeWidth="0.8" />
      {/* Band top shine strip */}
      <rect x="10" y="68.5" width="98" height="3" rx="1.5" fill={`url(#${id}-band-shine)`} />

      {/* Band ornate pattern - scrollwork */}
      <path d="M16 75 Q22 71 28 75 Q34 79 40 75 Q46 71 52 75" stroke="#B8860B" strokeWidth="0.5" opacity="0.5" fill="none" />
      <path d="M66 75 Q72 71 78 75 Q84 79 90 75 Q96 71 102 75" stroke="#B8860B" strokeWidth="0.5" opacity="0.5" fill="none" />
      {/* Band bottom edge detail */}
      <path d="M16 79 Q22 77 28 79 Q34 81 40 79 Q46 77 52 79" stroke="#A07008" strokeWidth="0.4" opacity="0.35" fill="none" />
      <path d="M66 79 Q72 77 78 79 Q84 81 90 79 Q96 77 102 79" stroke="#A07008" strokeWidth="0.4" opacity="0.35" fill="none" />
      {/* Band small diamond accents */}
      <polygon points="24,75 26,73 28,75 26,77" fill="#FFE066" opacity="0.4" />
      <polygon points="90,75 92,73 94,75 92,77" fill="#FFE066" opacity="0.4" />

      {/* Jewel bezels (gold prong settings) */}
      {/* Center jewel bezel */}
      <ellipse cx="59" cy="50" rx="10" ry="11" fill="none" stroke="#C8960C" strokeWidth="2" />
      <ellipse cx="59" cy="50" rx="10" ry="11" fill="none" stroke="#FFE066" strokeWidth="0.5" opacity="0.4" />
      {/* Center jewel */}
      <g filter={`url(#${id}-jewel-glow)`}>
        <ellipse cx="59" cy="50" rx="8" ry="9" fill={`url(#${id}-jewel)`} />
      </g>
      <ellipse cx="59" cy="50" rx="8" ry="9" fill={`url(#${id}-jewel-facet)`} />
      {/* Facet line */}
      <path d="M53 46 L59 41 L65 46" stroke={j.light} strokeWidth="0.4" opacity="0.5" fill="none" />
      <path d="M53 54 L59 59 L65 54" stroke={j.deep} strokeWidth="0.3" opacity="0.4" fill="none" />
      {/* Sparkle */}
      <ellipse cx="55" cy="45" rx="3" ry="2.5" fill={`url(#${id}-sparkle)`} />
      <ellipse cx="63" cy="55" rx="1.5" ry="1" fill="white" opacity="0.12" />

      {/* Left jewel bezel */}
      <circle cx="32" cy="55" r="7" fill="none" stroke="#C8960C" strokeWidth="1.8" />
      <circle cx="32" cy="55" r="7" fill="none" stroke="#FFE066" strokeWidth="0.4" opacity="0.4" />
      {/* Left jewel */}
      <g filter={`url(#${id}-jewel-glow)`}>
        <circle cx="32" cy="55" r="5.5" fill={`url(#${id}-jewel)`} />
      </g>
      <circle cx="32" cy="55" r="5.5" fill={`url(#${id}-jewel-facet)`} />
      <path d="M28 52 L32 49 L36 52" stroke={j.light} strokeWidth="0.3" opacity="0.4" fill="none" />
      <circle cx="29.5" cy="52" r="2" fill={`url(#${id}-sparkle)`} />

      {/* Right jewel bezel */}
      <circle cx="86" cy="55" r="7" fill="none" stroke="#C8960C" strokeWidth="1.8" />
      <circle cx="86" cy="55" r="7" fill="none" stroke="#FFE066" strokeWidth="0.4" opacity="0.4" />
      {/* Right jewel */}
      <g filter={`url(#${id}-jewel-glow)`}>
        <circle cx="86" cy="55" r="5.5" fill={`url(#${id}-jewel)`} />
      </g>
      <circle cx="86" cy="55" r="5.5" fill={`url(#${id}-jewel-facet)`} />
      <path d="M82 52 L86 49 L90 52" stroke={j.light} strokeWidth="0.3" opacity="0.4" fill="none" />
      <circle cx="83.5" cy="52" r="2" fill={`url(#${id}-sparkle)`} />

      {/* Band center jewel bezel */}
      <ellipse cx="59" cy="75" rx="6.5" ry="5.5" fill="none" stroke="#C8960C" strokeWidth="1.5" />
      {/* Band center jewel */}
      <g filter={`url(#${id}-jewel-glow)`}>
        <ellipse cx="59" cy="75" rx="5" ry="4.5" fill={`url(#${id}-jewel)`} />
      </g>
      <ellipse cx="59" cy="75" rx="5" ry="4.5" fill={`url(#${id}-jewel-facet)`} />
      <ellipse cx="56.5" cy="72.5" rx="2" ry="1.5" fill={`url(#${id}-sparkle)`} />

      {/* Prong tips - orb finials */}
      {/* Center tip */}
      <ellipse cx="58" cy="9" rx="5" ry="6" fill={`url(#${id}-gold-highlight)`} stroke="#B8860B" strokeWidth="0.6" />
      <ellipse cx="58" cy="9" rx="5" ry="6" fill="#FFFBE0" opacity="0.15" />
      <circle cx="58" cy="7.5" r="3" fill={`url(#${id}-jewel)`} stroke="#C8960C" strokeWidth="0.5" />
      <circle cx="56.5" cy="6" r="1.2" fill={`url(#${id}-sparkle)`} />

      {/* Left tip */}
      <ellipse cx="4" cy="24" rx="5" ry="5.5" fill={`url(#${id}-gold-highlight)`} stroke="#B8860B" strokeWidth="0.6" />
      <ellipse cx="4" cy="24" rx="5" ry="5.5" fill="#FFFBE0" opacity="0.15" />
      <circle cx="4" cy="23" r="2.8" fill={`url(#${id}-jewel)`} stroke="#C8960C" strokeWidth="0.5" />
      <circle cx="2.8" cy="21.5" r="1" fill={`url(#${id}-sparkle)`} />

      {/* Right tip */}
      <ellipse cx="114" cy="24" rx="5" ry="5.5" fill={`url(#${id}-gold-highlight)`} stroke="#B8860B" strokeWidth="0.6" />
      <ellipse cx="114" cy="24" rx="5" ry="5.5" fill="#FFFBE0" opacity="0.15" />
      <circle cx="114" cy="23" r="2.8" fill={`url(#${id}-jewel)`} stroke="#C8960C" strokeWidth="0.5" />
      <circle cx="112.8" cy="21.5" r="1" fill={`url(#${id}-sparkle)`} />

      {/* Metallic reflection streaks */}
      <path d="M14 45 Q30 36 46 44" stroke="#FFFBE0" strokeWidth="0.6" opacity="0.35" fill="none" />
      <path d="M72 44 Q88 36 104 45" stroke="#FFFBE0" strokeWidth="0.6" opacity="0.3" fill="none" />
      <path d="M28 62 Q43 57 58 62" stroke="#FFFBE0" strokeWidth="0.4" opacity="0.25" fill="none" />
      <path d="M60 62 Q75 57 90 62" stroke="#FFFBE0" strokeWidth="0.4" opacity="0.2" fill="none" />
      {/* Crown body edge highlight */}
      <path d="M12 70 L108 70" stroke="#FFE880" strokeWidth="0.5" opacity="0.3" />

      {/* Animated sparkles */}
      {animate && (
        <>
          <circle cx="4" cy="18" r="2.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.8;0" dur="3s" begin="0s" repeatCount="indefinite" />
            <animate attributeName="r" values="1;3;1" dur="3s" begin="0s" repeatCount="indefinite" />
          </circle>
          <circle cx="58" cy="3" r="2.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.9;0" dur="3.5s" begin="1.2s" repeatCount="indefinite" />
            <animate attributeName="r" values="1;3.5;1" dur="3.5s" begin="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="114" cy="18" r="2.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.8;0" dur="3s" begin="2s" repeatCount="indefinite" />
            <animate attributeName="r" values="1;3;1" dur="3s" begin="2s" repeatCount="indefinite" />
          </circle>
          {/* Sweeping shine across band */}
          <rect x="8" y="69" width="8" height="3" rx="1.5" fill="white" opacity="0">
            <animate attributeName="opacity" values="0;0.5;0" dur="2.5s" begin="1.8s" repeatCount="indefinite" />
            <animate attributeName="x" values="8;100" dur="2.5s" begin="1.8s" repeatCount="indefinite" />
          </rect>
          {/* Jewel pulse */}
          <ellipse cx="59" cy="50" rx="8" ry="9" fill={j.glow} opacity="0">
            <animate attributeName="opacity" values="0;0.15;0" dur="4s" begin="0.5s" repeatCount="indefinite" />
          </ellipse>
          {/* Edge gleams */}
          <path d="M3 28 L10 68" stroke="#FFFBE0" strokeWidth="1" opacity="0" strokeLinecap="round">
            <animate attributeName="opacity" values="0;0.35;0" dur="4s" begin="0.5s" repeatCount="indefinite" />
          </path>
          <path d="M115 28 L108 68" stroke="#FFFBE0" strokeWidth="1" opacity="0" strokeLinecap="round">
            <animate attributeName="opacity" values="0;0.35;0" dur="4s" begin="2.5s" repeatCount="indefinite" />
          </path>
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
