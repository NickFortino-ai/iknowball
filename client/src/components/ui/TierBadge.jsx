const tierColors = {
  Lost: 'bg-tier-lost/20 text-tier-lost border-tier-lost/30',
  Rookie: 'bg-tier-rookie/20 text-tier-rookie border-tier-rookie/30',
  Baller: 'bg-tier-baller/20 text-tier-baller border-tier-baller/30',
  Elite: 'bg-tier-elite/20 text-tier-elite border-tier-elite/30',
  'Hall of Famer': 'bg-tier-hof/20 text-tier-hof border-tier-hof/30',
  GOAT: 'bg-tier-goat/20 text-tier-goat border-tier-goat/30',
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
