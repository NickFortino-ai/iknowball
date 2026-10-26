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

// Ceiling on a parlay's combined multiplier. This is NOT a balance lever —
// it exists only to keep the value inside its column. combined_multiplier is
// NUMERIC(10, 4): 10 digits with 4 after the point leaves just 6 in front, so
// the column tops out at 999999.9999 and anything larger fails the insert
// with a raw Postgres "numeric field overflow" rendered into the UI. An
// 11-leg slate of MLS underdogs priced at 9,867,763x and did exactly that.
//
// Deliberately set AT that ceiling rather than below it, so moonshot parlays
// stay worth chasing. The shape of the risk, measured off our own history:
//
//   tickets above   1,000x in 2026: 21  -> ~1 hit every 128 years
//   tickets above  10,000x in 2026:  6  -> ~1 hit every 6,258 years
//   tickets above 100,000x in 2026:  3  -> ~1 hit every 89,073 years
//
// (Fair-odds model, chance of landing = 1/multiplier. Trustworthy: it
// predicts 524.6 winners/yr against 497 actual, inside 6%.)
//
// So the exposure is real but astronomically rare. A hit at this ceiling pays
// ~10M points against an all-time leader of 634, which would end the
// cumulative leaderboard permanently — accepted knowingly, because at one
// occurrence per ~128 years even the 1000x tier was costing more fun than it
// bought. If that trade ever needs revisiting, cap the POINTS and leave the
// multiplier free: the biggest_parlay record already exists to carry the brag.
export const MAX_PARLAY_MULTIPLIER = 999999

export function getTier(points) {
  if (points >= TIERS.GOAT.minPoints) return TIERS.GOAT
  if (points >= TIERS.HALL_OF_FAMER.minPoints) return TIERS.HALL_OF_FAMER
  if (points >= TIERS.ELITE.minPoints) return TIERS.ELITE
  if (points >= TIERS.BALLER.minPoints) return TIERS.BALLER
  if (points >= TIERS.ROOKIE.minPoints) return TIERS.ROOKIE
  return TIERS.LOST
}
