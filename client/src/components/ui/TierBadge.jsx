const tierColors = {
  Rookie: 'bg-tier-rookie/20 text-tier-rookie border-tier-rookie/30',
  Starter: 'bg-tier-starter/20 text-tier-starter border-tier-starter/30',
  'All-Star': 'bg-tier-allstar/20 text-tier-allstar border-tier-allstar/30',
  MVP: 'bg-tier-mvp/20 text-tier-mvp border-tier-mvp/30',
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
