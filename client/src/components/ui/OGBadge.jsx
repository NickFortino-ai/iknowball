// OG badge — earliest active users who helped Nick build IKB. Inline
// SVG that uses the IKB accent orange so it reads as on-brand alongside
// the rest of the dark UI.

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
        <linearGradient id="og-orange" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF6A1A" />
          <stop offset="100%" stopColor="#CC3D00" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill="url(#og-orange)" />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Audiowide', sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#FFFFFF"
      >
        OG
      </text>
    </svg>
  )
}
