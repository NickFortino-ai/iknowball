export const TIERS = {
  LOST: { name: 'Lost', minPoints: -Infinity, color: 'red' },
  ROOKIE: { name: 'Rookie', minPoints: 0, color: 'gray' },
  BALLER: { name: 'Baller', minPoints: 100, color: 'blue' },
  ELITE: { name: 'Elite', minPoints: 500, color: 'purple' },
  HALL_OF_FAMER: { name: 'Hall of Famer', minPoints: 1000, color: 'amber' },
  GOAT: { name: 'GOAT', minPoints: 3000, color: 'gold' },
}

export const GAME_STATUS = {
  UPCOMING: 'upcoming',
  LIVE: 'live',
  FINAL: 'final',
}

export const PICK_STATUS = {
  PENDING: 'pending',
  LOCKED: 'locked',
  SETTLED: 'settled',
}

export const BASE_RISK_POINTS = 10

export function getTier(points) {
  if (points >= TIERS.GOAT.minPoints) return TIERS.GOAT
  if (points >= TIERS.HALL_OF_FAMER.minPoints) return TIERS.HALL_OF_FAMER
  if (points >= TIERS.ELITE.minPoints) return TIERS.ELITE
  if (points >= TIERS.BALLER.minPoints) return TIERS.BALLER
  if (points >= TIERS.ROOKIE.minPoints) return TIERS.ROOKIE
  return TIERS.LOST
}
