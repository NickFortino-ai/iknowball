import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { sendEmailToUserIds } from '../services/emailService.js'

/**
 * Send notifications and emails for weekly recaps that are now visible
 * to users but haven't had notifications sent yet.
 */
export async function sendRecapNotifications() {
  const now = new Date().toISOString()

  // Find recaps that are visible but notifications haven't been sent
  const { data: recaps, error } = await supabase
    .from('weekly_recaps')
    .select('id, week_start, week_end, featured_user_ids, pick_of_week_user_id, biggest_fall_user_id, longest_streak_user_id')
    .is('notifications_sent_at', null)
    .or(`visible_after.is.null,visible_after.lte.${now}`)

  if (error) {
    logger.error({ error }, 'Failed to query unsent recap notifications')
    return
  }

  if (!recaps?.length) return

  for (const recap of recaps) {
    const featuredUserIds = recap.featured_user_ids || []
    if (!featuredUserIds.length) {
      // No featured users — just mark as sent
      await supabase
        .from('weekly_recaps')
        .update({ notifications_sent_at: now })
        .eq('id', recap.id)
      continue
    }

    // Send in-app notifications
    for (const userId of featuredUserIds) {
      try {
        await createNotification(
          userId,
          'headlines',
          'You made the Weekly Headlines this week! Check it out.',
          { weekStart: recap.week_start, weekEnd: recap.week_end }
        )
      } catch (err) {
        logger.error({ err, userId }, 'Failed to send headlines notification')
      }
    }

    // Look up user data for email personalization
    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name')
      .in('id', featuredUserIds)

    const userMap = {}
    for (const u of users || []) {
      userMap[u.id] = u
    }

    // Determine which users got which award for email personalization
    const topRankedIds = new Set(featuredUserIds)
    const awardUserIds = new Set()
    if (recap.pick_of_week_user_id) awardUserIds.add(recap.pick_of_week_user_id)
    if (recap.biggest_fall_user_id) awardUserIds.add(recap.biggest_fall_user_id)
    if (recap.longest_streak_user_id) awardUserIds.add(recap.longest_streak_user_id)

    const baseUrl = env.CORS_ORIGIN.split(',')[0].trim()

    // Send personalized emails
    try {
      await sendEmailToUserIds(featuredUserIds, (userId) => {
        const userData = userMap[userId]
        const name = userData?.display_name || userData?.username || 'Baller'
        const isTopRanked = topRankedIds.has(userId) && !awardUserIds.has(userId)

        const personalLine = isTopRanked
          ? 'You were featured in this week\'s headlines. See what they have to say about your week.'
          : 'You earned a shoutout in this week\'s awards section. Open the app to see what you won.'

        const subject = "You made this week's Headlines"
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h1 style="font-size: 24px; margin-bottom: 8px;">Weekly Headlines</h1>
            <p style="color: #aaa; font-size: 16px; margin-bottom: 24px;">
              Hey <strong>${name}</strong>, you made this week's Headlines on I KNOW BALL!
            </p>
            <p style="font-size: 15px; color: #ccc; margin-bottom: 24px;">
              ${personalLine}
            </p>
            <a href="${baseUrl}/hall-of-fame?section=headlines"
               style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              See Full Headlines
            </a>
          </div>
        `

        return { subject, html }
      })
    } catch (err) {
      logger.error({ err }, 'Failed to send recap emails')
    }

    // Mark notifications as sent
    await supabase
      .from('weekly_recaps')
      .update({ notifications_sent_at: now })
      .eq('id', recap.id)

    logger.info({ recapId: recap.id, weekStart: recap.week_start, featured: featuredUserIds.length }, 'Recap notifications sent')
  }
}
