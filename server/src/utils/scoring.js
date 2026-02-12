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
 * Calculate risk points from American odds.
 * Underdogs risk less, favorites risk more.
 * Risk = base / multiplier
 */
export function calculateRiskPoints(odds) {
  const multiplier = americanToMultiplier(odds)
  return Math.max(1, Math.round(BASE_RISK_POINTS / multiplier))
}

/**
 * Calculate reward points from American odds.
 * Underdogs win more, favorites win less.
 * Reward = base * multiplier
 */
export function calculateRewardPoints(odds) {
  const multiplier = americanToMultiplier(odds)
  return Math.max(1, Math.round(BASE_RISK_POINTS * multiplier))
}
