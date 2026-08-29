import { calculateRiskPoints, calculateRewardPoints } from './scoring.js'

// Resolve a pick's odds / risk / reward.
//
// These are normally written once, at LOCK time, from the values captured
// when the user submitted. A pick that never locked — see the lockPicks race
// in scoringService — still has risk_points and reward_points NULL, so
// anything computing `pick.reward_points || 0` scores it as ZERO.
//
// Shared by lockPicks (which persists the result) and scoreCompletedGame
// (which resolves on the fly for a pick that slipped the lock), so the two
// can never disagree about what a pick was worth.
//
// `game` is only consulted for legacy rows with no submission odds; pass null
// when you don't have it and those rows resolve to a 0 stake, same as before.
export function resolvePickStake(pick, game = null) {
  const mult = pick.multiplier || 1

  if (pick.odds_at_submission != null) {
    const odds = pick.odds_at_submission
    return {
      odds,
      // `||` not `??`, matching lockPicks.js exactly — a stored 0 recomputes
      // there, and this helper must not quietly change that.
      risk: pick.risk_at_submission || (calculateRiskPoints(odds) * mult),
      reward: pick.reward_at_submission || (calculateRewardPoints(odds) * mult),
    }
  }

  const odds = pick.picked_team === 'home' ? game?.home_odds : game?.away_odds
  return {
    odds: odds ?? null,
    risk: odds ? calculateRiskPoints(odds) * mult : 0,
    reward: odds ? calculateRewardPoints(odds) * mult : 0,
  }
}
