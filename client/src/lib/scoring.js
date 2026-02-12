export const BASE_RISK_POINTS = 10

export const TIERS = {
  ROOKIE: { name: 'Rookie', minPoints: 0, color: 'tier-rookie' },
  STARTER: { name: 'Starter', minPoints: 100, color: 'tier-starter' },
  ALL_STAR: { name: 'All-Star', minPoints: 500, color: 'tier-allstar' },
  MVP: { name: 'MVP', minPoints: 2000, color: 'tier-mvp' },
  GOAT: { name: 'GOAT', minPoints: 10000, color: 'tier-goat' },
}

export function getTier(points) {
  const floored = Math.max(0, points)
  if (floored >= TIERS.GOAT.minPoints) return TIERS.GOAT
  if (floored >= TIERS.MVP.minPoints) return TIERS.MVP
  if (floored >= TIERS.ALL_STAR.minPoints) return TIERS.ALL_STAR
  if (floored >= TIERS.STARTER.minPoints) return TIERS.STARTER
  return TIERS.ROOKIE
}

export function getNextTier(points) {
  const floored = Math.max(0, points)
  if (floored >= TIERS.GOAT.minPoints) return null
  if (floored >= TIERS.MVP.minPoints) return TIERS.GOAT
  if (floored >= TIERS.ALL_STAR.minPoints) return TIERS.MVP
  if (floored >= TIERS.STARTER.minPoints) return TIERS.ALL_STAR
  return TIERS.STARTER
}

export function americanToMultiplier(odds) {
  if (odds > 0) return odds / 100
  return 100 / Math.abs(odds)
}

export function calculateRiskPoints(odds) {
  const multiplier = americanToMultiplier(odds)
  return Math.max(1, Math.round(BASE_RISK_POINTS / multiplier))
}

export function calculateRewardPoints(odds) {
  const multiplier = americanToMultiplier(odds)
  return Math.max(1, Math.round(BASE_RISK_POINTS * multiplier))
}

export function formatOdds(odds) {
  if (odds > 0) return `+${odds}`
  return `${odds}`
}
