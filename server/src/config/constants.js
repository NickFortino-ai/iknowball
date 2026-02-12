export const TIERS = {
  ROOKIE: { name: 'Rookie', minPoints: 0, color: 'gray' },
  STARTER: { name: 'Starter', minPoints: 100, color: 'blue' },
  ALL_STAR: { name: 'All-Star', minPoints: 500, color: 'purple' },
  MVP: { name: 'MVP', minPoints: 2000, color: 'amber' },
  GOAT: { name: 'GOAT', minPoints: 10000, color: 'gold' },
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
  const floored = Math.max(0, points)
  if (floored >= TIERS.GOAT.minPoints) return TIERS.GOAT
  if (floored >= TIERS.MVP.minPoints) return TIERS.MVP
  if (floored >= TIERS.ALL_STAR.minPoints) return TIERS.ALL_STAR
  if (floored >= TIERS.STARTER.minPoints) return TIERS.STARTER
  return TIERS.ROOKIE
}
