// OG badge — just the letters "OG" in display font, with a metallic
// gold gradient (pale highlight → gold → a reflective mid-band → deep
// gold) so it reads as a shiny gold mark. No container shape; reads as
// a typographic mark, on brand.

const HEIGHT_PX = {
  xs: 14,
  sm: 18,
  md: 24,
  lg: 36,
  xl: 56,
}

export default function OGBadge({ size = 'md', className = '' }) {
  const h = HEIGHT_PX[size] || HEIGHT_PX.md
  // 3:2 aspect ratio fits "OG" naturally — wider than tall.
  const w = Math.round(h * 1.5)
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 60 40"
      role="img"
      aria-label="OG"
      className={`shrink-0 ${className}`}
    >
      <title>OG — one of the earliest IKB members</title>
      <defs>
        <linearGradient id="og-gradient" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF7CC" />
          <stop offset="20%" stopColor="#FBE48A" />
          <stop offset="46%" stopColor="#E8B530" />
          <stop offset="56%" stopColor="#F6D873" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <text
        x="30"
        y="22"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Audiowide', sans-serif"
        fontSize="34"
        fontWeight="700"
        fill="url(#og-gradient)"
      >
        OG
      </text>
    </svg>
  )
}
