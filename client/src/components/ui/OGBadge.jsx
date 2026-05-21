// OG badge — earliest active users who helped Nick build IKB.
// Image lives at /og-badge.png (in client/public). Sizes are tuned to
// blend with TierBadge in modal headers and list rows.

const SIZES = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-20 h-20',
}

export default function OGBadge({ size = 'md', className = '' }) {
  const sizeClass = SIZES[size] || SIZES.md
  return (
    <img
      src="/og-badge.png"
      alt="OG"
      title="OG — one of the earliest IKB members"
      className={`${sizeClass} object-contain shrink-0 ${className}`}
    />
  )
}
