import { BASE_RISK_POINTS } from '../config/constants.js'

/**
 * Convert American odds to decimal payout multiplier.
 * +150 means risk $100 to win $150 → multiplier = 1.5
 * -200 means risk $200 to win $100 → multiplier = 0.5
 */
export function americanToMultiplier(odds) {
  if (odds > 0) return odds / 100
  return 100 / Math.abs(odds)
}

/**
 * Calculate reward points from American odds.
 * Risk is always BASE_RISK_POINTS.
 * Reward = risk * multiplier, rounded to nearest integer.
 */
export function calculateRewardPoints(odds) {
  const multiplier = americanToMultiplier(odds)
  return Math.round(BASE_RISK_POINTS * multiplier)
}
