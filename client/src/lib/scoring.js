export const BASE_RISK_POINTS = 10

export const TIERS = {
  LOST: { name: 'Lost', minPoints: -Infinity, color: 'tier-lost' },
  ROOKIE: { name: 'Rookie', minPoints: 0, color: 'tier-rookie' },
  BALLER: { name: 'Baller', minPoints: 100, color: 'tier-baller' },
  ELITE: { name: 'Elite', minPoints: 500, color: 'tier-elite' },
  HALL_OF_FAMER: { name: 'Hall of Famer', minPoints: 1000, color: 'tier-hof' },
  GOAT: { name: 'GOAT', minPoints: 3000, color: 'tier-goat' },
}

export function getTier(points) {
  if (points >= TIERS.GOAT.minPoints) return TIERS.GOAT
  if (points >= TIERS.HALL_OF_FAMER.minPoints) return TIERS.HALL_OF_FAMER
  if (points >= TIERS.ELITE.minPoints) return TIERS.ELITE
  if (points >= TIERS.BALLER.minPoints) return TIERS.BALLER
  if (points >= TIERS.ROOKIE.minPoints) return TIERS.ROOKIE
  return TIERS.LOST
}

export function getNextTier(points) {
  if (points >= TIERS.GOAT.minPoints) return null
  if (points >= TIERS.HALL_OF_FAMER.minPoints) return TIERS.GOAT
  if (points >= TIERS.ELITE.minPoints) return TIERS.HALL_OF_FAMER
  if (points >= TIERS.BALLER.minPoints) return TIERS.ELITE
  if (points >= TIERS.ROOKIE.minPoints) return TIERS.BALLER
  return TIERS.ROOKIE
}

export function americanToMultiplier(odds) {
  if (odds > 0) return odds / 100
  return 100 / Math.abs(odds)
}

export function calculateRiskPoints(odds) {
  if (odds < -1000) {
    return Math.round(Math.abs(odds) / 100)
  }
  return BASE_RISK_POINTS
}

export function calculateRewardPoints(odds) {
  const multiplier = americanToMultiplier(odds)
  return Math.max(1, Math.round(BASE_RISK_POINTS * multiplier))
}

export function formatOdds(odds) {
  if (odds > 0) return `+${odds}`
  return `${odds}`
}
