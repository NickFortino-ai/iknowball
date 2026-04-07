import { syncWeeklyStats, getNFLState } from '../services/sleeperService.js'
import { logger } from '../utils/logger.js'

/**
 * Auto-detect the current NFL week and sync weekly stats from Sleeper.
 * Runs frequently during NFL game windows so live fantasy scores stay fresh.
 *
 * Sleeper updates pts_ppr / pts_half_ppr / pts_std continuously during games,
 * so polling Sleeper every couple minutes is the closest equivalent to "real
 * time" updates without paying for a premium feed.
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
    logger.info({ season, week, ...result }, 'NFL stats auto-sync complete')
    return result
  } catch (err) {
    logger.error({ err, season, week }, 'NFL stats auto-sync failed')
  }
}
