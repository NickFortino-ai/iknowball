// OG badge — earliest active users who helped Nick build IKB. Rendered
// as an inline SVG so it stays crisp at any size and inherits the
// Royalty gold palette (matches the crown SVGs in RoyaltyPage).

const SIZE_PX = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 80,
}

export default function OGBadge({ size = 'md', className = '' }) {
  const px = SIZE_PX[size] || SIZE_PX.md
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 40 40"
      role="img"
      aria-label="OG"
      className={`shrink-0 ${className}`}
    >
      <title>OG — one of the earliest IKB members</title>
      <defs>
        <radialGradient id="og-fill" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#FFE066" />
          <stop offset="55%" stopColor="#DAA520" />
          <stop offset="100%" stopColor="#8B6914" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill="url(#og-fill)" stroke="#8B6914" strokeWidth="1.5" />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Audiowide', sans-serif"
        fontSize="14"
        fontWeight="700"
        fill="#1A1A25"
      >
        OG
      </text>
    </svg>
  )
}
