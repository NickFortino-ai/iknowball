import { syncWeeklyStats, getNFLState } from '../services/sleeperService.js'
import { logger } from '../utils/logger.js'

// Graceful degradation ladder for Sleeper rate limiting.
// Each entry: { rateMs (sync interval), penaltyMs (one-time wait after 429 before resuming) }
const RATE_LADDER = [
  { rateMs: 15 * 1000, penaltyMs: 0 },             // 0: ideal — 15 sec
  { rateMs: 20 * 1000, penaltyMs: 60 * 1000 },     // 1: 1 min wait → 20 sec
  { rateMs: 30 * 1000, penaltyMs: 60 * 1000 },     // 2: 1 min wait → 30 sec
  { rateMs: 45 * 1000, penaltyMs: 2 * 60 * 1000 }, // 3: 2 min wait → 45 sec
  { rateMs: 60 * 1000, penaltyMs: 2 * 60 * 1000 }, // 4: 2 min wait → 60 sec
  { rateMs: 90 * 1000, penaltyMs: 5 * 60 * 1000 }, // 5+: 5 min wait → 90 sec
]
const SUCCESS_TO_RECOVER = 20 // successful syncs needed at current rate before stepping back down

let rateIndex = 0
let pendingPenaltyMs = 0   // applied to the NEXT delay only (post-429)
let successesAtCurrent = 0

export function isInNflGameWindow() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = now.getDay() // 0=Sun, 1=Mon, 2=Tue, 4=Thu, 5=Fri
  const hour = now.getHours()
  return (
    (day === 4 && hour >= 19) ||  // Thu 7pm-midnight
    (day === 5 && hour < 2) ||    // Fri before 2am
    (day === 0 && hour >= 12) ||  // Sun noon-midnight
    (day === 1 && hour < 2) ||    // Mon before 2am
    (day === 1 && hour >= 19) ||  // Mon 7pm-midnight
    (day === 2 && hour < 2)       // Tue before 2am
  )
}

export function getNextNflSyncDelayMs() {
  // Off-window: no need to be aggressive
  if (!isInNflGameWindow()) return 5 * 60 * 1000

  // One-time penalty wait after a 429, then resume at the new rate
  if (pendingPenaltyMs > 0) {
    const wait = pendingPenaltyMs
    pendingPenaltyMs = 0
    return wait
  }

  return RATE_LADDER[rateIndex].rateMs
}

function on429() {
  // Step up the ladder, capped at the slowest tier
  rateIndex = Math.min(rateIndex + 1, RATE_LADDER.length - 1)
  pendingPenaltyMs = RATE_LADDER[rateIndex].penaltyMs
  successesAtCurrent = 0
  logger.warn({ rateIndex, newRateSec: RATE_LADDER[rateIndex].rateMs / 1000, penaltyMs: pendingPenaltyMs }, 'Sleeper 429 — stepping up sync interval')
}

function onSuccess() {
  if (rateIndex === 0) return
  successesAtCurrent++
  if (successesAtCurrent >= SUCCESS_TO_RECOVER) {
    rateIndex = Math.max(rateIndex - 1, 0)
    successesAtCurrent = 0
    logger.info({ rateIndex, newRateSec: RATE_LADDER[rateIndex].rateMs / 1000 }, 'Sleeper recovered — stepping down sync interval')
  }
}

/**
 * Auto-detect the current NFL week and sync weekly stats from Sleeper.
 * Runs frequently during NFL game windows so live fantasy scores stay fresh.
 *
 * Sleeper updates pts_ppr / pts_half_ppr / pts_std continuously during games,
 * so polling Sleeper every 15 seconds during games is the closest equivalent
 * to "real time" updates without paying for a premium feed.
 */
export async function syncNflStatsCurrentWeek() {
  const state = await getNFLState()
  if (!state) {
    logger.warn('NFL state unavailable, skipping NFL stats sync')
    return
  }

  const season = state.season ? parseInt(state.season, 10) : new Date().getUTCFullYear()
  // Sleeper exposes 'week' (current display week) and 'season_type'.
  // We only sync regular season + playoffs (skip preseason / off).
  const seasonType = state.season_type
  if (seasonType !== 'regular' && seasonType !== 'post') {
    logger.debug({ seasonType }, 'Skipping NFL stats sync — not regular/post season')
    return
  }

  const week = state.week ? parseInt(state.week, 10) : null
  if (!week || week < 1) {
    logger.debug({ week }, 'Skipping NFL stats sync — no current week')
    return
  }

  // Only sync during US-time windows when NFL games are typically being played.
  // Outside windows we still run on a sparse schedule for late-update edge cases,
  // but caller can choose to skip via the cron expression.
  try {
    const result = await syncWeeklyStats(season, week)
    onSuccess()
    logger.info({ season, week, ...result }, 'NFL stats auto-sync complete')
    return result
  } catch (err) {
    if (err?.message?.includes('429')) {
      on429()
    } else {
      logger.error({ err, season, week }, 'NFL stats auto-sync failed')
    }
  }
}

/**
 * Self-rescheduling tick that runs syncNflStatsCurrentWeek and re-enqueues
 * itself with a delay based on whether we're in a game window.
 *
 * Replaces the node-cron schedule because cron can't go below 1-minute
 * intervals and we want 15-second polling during live games.
 */
let _tickTimer = null
export function startNflStatsTickLoop() {
  async function tick() {
    try {
      await syncNflStatsCurrentWeek()
    } catch (err) {
      // already logged inside the helper
    }
    _tickTimer = setTimeout(tick, getNextNflSyncDelayMs())
  }
  // Kick off the first tick after a short delay so it doesn't fight startup
  _tickTimer = setTimeout(tick, 5000)
}

export function stopNflStatsTickLoop() {
  if (_tickTimer) {
    clearTimeout(_tickTimer)
    _tickTimer = null
  }
}
