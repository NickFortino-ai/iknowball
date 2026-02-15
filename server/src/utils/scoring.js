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
 * Calculate risk points.
 * Flat 10 for odds -1000 and closer to even.
 * For heavy favorites beyond -1000, risk scales: |odds| / 100 rounded.
 */
export function calculateRiskPoints(odds) {
  if (odds < -1000) {
    return Math.round(Math.abs(odds) / 100)
  }
  return BASE_RISK_POINTS
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
