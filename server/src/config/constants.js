export const TIERS = {
  LOST: { name: 'Learning', minPoints: -Infinity, color: 'red' },
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

// Ceiling on a parlay's combined multiplier, so a 10-point risk can never pay
// more than 9,990. Parlay odds multiply, so an 11-leg slate of MLS underdogs
// reached 9,867,763x — a payout that would have ended the leaderboard, since
// the all-time points leader sits at 634. Six tickets offering between 122k
// and 8.88M points have already been locked and displayed since February;
// every one lost, which is the only reason the number never landed.
//
// Set against history, not taste: across 2,121 parlays and 497 winners, the
// biggest ticket anyone has ever actually hit is 43.8x and the median winner
// is 2.77x. A 1000x cap clips 21 tickets ever submitted and ZERO winners, so
// it is invisible to real play and bites only on lottery slips.
//
// It also keeps combined_multiplier inside NUMERIC(10, 4) — 10 digits with 4
// after the point leaves just 6 in front, so the column tops out at
// 999999.9999 and anything larger fails the insert with a raw Postgres
// "numeric field overflow" rendered into the UI. Widening the column alone
// would silence that error and remove the accidental guardrail with it.
export const MAX_PARLAY_MULTIPLIER = 1000

export function getTier(points) {
  if (points >= TIERS.GOAT.minPoints) return TIERS.GOAT
  if (points >= TIERS.HALL_OF_FAMER.minPoints) return TIERS.HALL_OF_FAMER
  if (points >= TIERS.ELITE.minPoints) return TIERS.ELITE
  if (points >= TIERS.BALLER.minPoints) return TIERS.BALLER
  if (points >= TIERS.ROOKIE.minPoints) return TIERS.ROOKIE
  return TIERS.LOST
}
