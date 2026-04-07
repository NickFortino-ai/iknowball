import { syncWeeklyStats, getNFLState } from '../services/sleeperService.js'
import { logger } from '../utils/logger.js'

// Track Sleeper rate-limit responses so we can back off if they push back
let consecutive429s = 0

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
  // If Sleeper has thrown 429 recently, back off aggressively until they recover
  if (consecutive429s >= 3) return 5 * 60 * 1000        // 5 min
  if (consecutive429s > 0) return 60 * 1000             // 1 min
  if (isInNflGameWindow()) return 15 * 1000              // 15 sec — live games
  return 5 * 60 * 1000                                   // 5 min — between game days
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
    consecutive429s = 0
    logger.info({ season, week, ...result }, 'NFL stats auto-sync complete')
    return result
  } catch (err) {
    if (err?.message?.includes('429')) {
      consecutive429s++
      logger.warn({ consecutive429s }, 'Sleeper returned 429, backing off')
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
