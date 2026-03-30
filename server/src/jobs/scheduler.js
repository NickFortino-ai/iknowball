import cron from 'node-cron'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { syncOdds } from './syncOdds.js'
import { scoreGames } from './scoreGames.js'
import { lockPicks } from './lockPicks.js'
import { syncFutures } from './syncFutures.js'
import { syncLiveScores } from './syncLiveScores.js'
import { completeLeagues } from './completeLeagues.js'
import { autoEliminateMissedPicks } from '../services/survivorService.js'
import { generateWeeklyRecap } from './generateRecap.js'
import { sendRecapNotifications } from './sendRecapNotifications.js'
import { snapshotCrowns } from './snapshotCrowns.js'
import { snapshotRanks } from './snapshotRanks.js'
import { recalculateRecords } from './recalculateRecords.js'
import { settleStuckParlays } from './settleStuckParlays.js'
import { syncInjuries } from './syncInjuries.js'
import { cleanupExpiredVideos } from './cleanupExpiredVideos.js'
import { scoreNBADFS } from './scoreNBADFS.js'
import { scoreMLBDFS } from './scoreMLBDFS.js'
import { settleNBAProps } from './settleNBAProps.js'
import { scoreSquares } from './scoreSquares.js'

export function startScheduler() {
  if (env.ENABLE_ODDS_SYNC) {
    cron.schedule('*/30 * * * *', async () => {
      try { await syncOdds() } catch (err) { logger.error({ err }, 'Odds sync job failed') }
    })
    logger.info('Odds sync scheduled: every 30 minutes')
  }

  if (env.ENABLE_GAME_SCORING) {
    cron.schedule('*/5 * * * *', async () => {
      try { await scoreGames() } catch (err) { logger.error({ err }, 'Score games job failed') }
    })
    logger.info('Game scoring scheduled: every 5 minutes')
  }

  if (env.ENABLE_PICK_LOCK) {
    cron.schedule('* * * * *', async () => {
      try { await lockPicks() } catch (err) { logger.error({ err }, 'Lock picks job failed') }
    })
    logger.info('Pick lock scheduled: every 1 minute')
  }

  if (env.ENABLE_FUTURES_SYNC) {
    cron.schedule('0 */6 * * *', async () => {
      try { await syncFutures() } catch (err) { logger.error({ err }, 'Futures sync job failed') }
    })
    logger.info('Futures sync scheduled: every 6 hours')
  }

  if (env.ENABLE_LIVE_SCORES) {
    cron.schedule('*/1 * * * *', async () => {
      try { await syncLiveScores() } catch (err) { logger.error({ err }, 'Live scores sync job failed') }
    })
    logger.info('Live scores sync scheduled: every 1 minute')
  }

  if (env.ENABLE_WEEKLY_RECAP) {
    cron.schedule('0 8 * * 1', async () => {
      try { await generateWeeklyRecap() } catch (err) { logger.error({ err }, 'Weekly recap job failed') }
    }, { timezone: 'America/New_York' })
    logger.info('Weekly recap scheduled: Monday at 8:00 AM EST (visible to users at 9:00 AM Pacific)')

    // Send recap notifications/emails once visible_after has passed
    cron.schedule('*/5 * * * *', async () => {
      try { await sendRecapNotifications() } catch (err) { logger.error({ err }, 'Recap notification job failed') }
    })
    logger.info('Recap notifications scheduled: every 5 minutes (sends when visible_after passes)')
  }

  if (env.ENABLE_RECORD_CALC) {
    // Snapshot crown holders daily at 3:50 AM EST
    cron.schedule('50 3 * * *', async () => {
      try { await snapshotCrowns() } catch (err) { logger.error({ err }, 'Crown snapshot job failed') }
    }, { timezone: 'America/New_York' })
    logger.info('Crown snapshot scheduled: daily at 3:50 AM EST')

    // Snapshot global ranks daily at 3:55 AM EST
    cron.schedule('55 3 * * *', async () => {
      try { await snapshotRanks() } catch (err) { logger.error({ err }, 'Rank snapshot job failed') }
    }, { timezone: 'America/New_York' })
    logger.info('Rank snapshot scheduled: daily at 3:55 AM EST')

    // Recalculate all records daily at 4:00 AM EST
    cron.schedule('0 4 * * *', async () => {
      try { await recalculateRecords() } catch (err) { logger.error({ err }, 'Record recalculation job failed') }
    }, { timezone: 'America/New_York' })
    logger.info('Record recalculation scheduled: daily at 4:00 AM EST')

    // Cleanup expired hot take videos daily at 4:15 AM EST
    cron.schedule('15 4 * * *', async () => {
      try { await cleanupExpiredVideos() } catch (err) { logger.error({ err }, 'Video cleanup job failed') }
    }, { timezone: 'America/New_York' })
    logger.info('Video cleanup scheduled: daily at 4:15 AM EST')
  }

  if (env.ENABLE_INJURY_SYNC) {
    cron.schedule('*/30 * * * *', async () => {
      try { await syncInjuries() } catch (err) { logger.error({ err }, 'Injury sync job failed') }
    })
    logger.info('Injury sync scheduled: every 30 minutes')
  }

  if (env.ENABLE_NBA_DFS) {
    // Generate salaries daily at 10:00 AM ET (before lineups lock) and score games every 10 min
    cron.schedule('0 10 * * *', async () => {
      try { await scoreNBADFS() } catch (err) { logger.error({ err }, 'NBA DFS salary generation failed') }
    }, { timezone: 'America/New_York' })
    logger.info('NBA DFS salary generation scheduled: daily at 10:00 AM EST')

    cron.schedule('*/1 * * * *', async () => {
      try { await scoreNBADFS() } catch (err) { logger.error({ err }, 'NBA DFS scoring job failed') }
    })
    logger.info('NBA DFS scoring scheduled: every 1 minute')

    // MLB DFS salary generation — daily at 10:00 AM EST
    cron.schedule('0 10 * * *', async () => {
      try { await scoreMLBDFS() } catch (err) { logger.error({ err }, 'MLB DFS salary generation failed') }
    }, { timezone: 'America/New_York' })
    logger.info('MLB DFS salary generation scheduled: daily at 10:00 AM EST')

    cron.schedule('*/2 * * * *', async () => {
      try { await scoreMLBDFS() } catch (err) { logger.error({ err }, 'MLB DFS scoring job failed') }
    })
    logger.info('MLB DFS scoring scheduled: every 2 minutes')

    // NBA prop auto-settlement suspended — settling manually via admin
    // cron.schedule('*/2 * * * *', async () => {
    //   try { await settleNBAProps() } catch (err) { logger.error({ err }, 'NBA prop auto-settlement failed') }
    // })
    // logger.info('NBA prop auto-settlement scheduled: every 2 minutes')
  }

  // League completion runs alongside game scoring — checks for ended pickem/bracket leagues
  if (env.ENABLE_GAME_SCORING) {
    cron.schedule('*/15 * * * *', async () => {
      try { await completeLeagues() } catch (err) { logger.error({ err }, 'League completion job failed') }
    })
    logger.info('League completion scheduled: every 15 minutes')

    cron.schedule('*/15 * * * *', async () => {
      try { await autoEliminateMissedPicks() } catch (err) { logger.error({ err }, 'Survivor missed picks job failed') }
    })
    logger.info('Survivor missed picks scheduled: every 15 minutes')

    cron.schedule('*/30 * * * *', async () => {
      try { await settleStuckParlays() } catch (err) { logger.error({ err }, 'Stuck parlay cleanup job failed') }
    })
    logger.info('Stuck parlay cleanup scheduled: every 30 minutes')

    cron.schedule('*/2 * * * *', async () => {
      try { await scoreSquares() } catch (err) { logger.error({ err }, 'Squares auto-score job failed') }
    })
    logger.info('Squares auto-lock/score scheduled: every 2 minutes')
  }
}
