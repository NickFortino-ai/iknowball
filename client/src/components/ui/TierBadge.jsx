const tierColors = {
  Lost: 'text-tier-lost border-tier-lost/30',
  Rookie: 'text-tier-rookie border-tier-rookie/30',
  Baller: 'text-tier-baller border-tier-baller/30',
  Elite: 'text-tier-elite border-tier-elite/30',
  'Hall of Famer': 'text-tier-hof border-tier-hof/30',
  GOAT: 'text-tier-goat border-tier-goat/30',
}

export default function TierBadge({ tier, size = 'sm' }) {
  const colors = tierColors[tier] || tierColors.Rookie
  const sizes = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
  }

  return (
    <span className={`inline-flex items-center font-semibold rounded-full border ${colors} ${sizes[size]}`}>
      {tier}
    </span>
  )
}
