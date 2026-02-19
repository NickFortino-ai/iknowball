import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { collectWeeklyData, generateRecapContent } from '../services/recapService.js'
import { createNotification } from '../services/notificationService.js'
import { sendEmailToUserIds } from '../services/emailService.js'

function formatLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function generateWeeklyRecap() {
  logger.info('Starting weekly recap generation')

  // Calculate last Monday–Sunday
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek + 6 // last Monday
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - daysBack)
  lastMonday.setHours(0, 0, 0, 0)

  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  lastSunday.setHours(23, 59, 59, 999)

  const weekStartStr = formatLocalDate(lastMonday)
  const weekEndStr = formatLocalDate(lastSunday)

  // Check if already generated
  const { data: existing } = await supabase
    .from('weekly_recaps')
    .select('id')
    .eq('week_start', weekStartStr)
    .maybeSingle()

  if (existing) {
    logger.info({ weekStart: weekStartStr }, 'Weekly recap already exists, skipping')
    return
  }

  // Collect weekly data
  const weeklyData = await collectWeeklyData(lastMonday, lastSunday)

  if (!weeklyData.top5.length) {
    logger.info('No users with picks this week, skipping recap')
    return
  }

  // Generate AI recap content (with 1 retry)
  let recapContent
  try {
    recapContent = await generateRecapContent(weeklyData, weekStartStr, weekEndStr)
  } catch (err) {
    logger.warn({ err: err.message }, 'Claude API failed, retrying in 5s')
    await new Promise((r) => setTimeout(r, 5000))
    recapContent = await generateRecapContent(weeklyData, weekStartStr, weekEndStr)
  }

  // Determine featured user IDs (deduplicated)
  const featuredSet = new Set(weeklyData.top5.map((u) => u.user_id))
  if (weeklyData.pickOfWeekUser) featuredSet.add(weeklyData.pickOfWeekUser.user_id)
  if (weeklyData.biggestFallUser) featuredSet.add(weeklyData.biggestFallUser.user_id)
  if (weeklyData.longestStreakUser) featuredSet.add(weeklyData.longestStreakUser.user_id)
  const featuredUserIds = [...featuredSet]

  // Save to DB
  const { error: insertError } = await supabase.from('weekly_recaps').insert({
    week_start: weekStartStr,
    week_end: weekEndStr,
    recap_content: recapContent,
    featured_user_ids: featuredUserIds,
    pick_of_week_user_id: weeklyData.pickOfWeekUser?.user_id || null,
    biggest_fall_user_id: weeklyData.biggestFallUser?.user_id || null,
    longest_streak_user_id: weeklyData.longestStreakUser?.user_id || null,
  })

  if (insertError) {
    logger.error({ error: insertError }, 'Failed to save weekly recap')
    throw insertError
  }

  // Send in-app notifications to featured users
  for (const userId of featuredUserIds) {
    try {
      await createNotification(
        userId,
        'power_rankings',
        'You made the Weekly Power Rankings this week! Check it out.',
        { weekStart: weekStartStr, weekEnd: weekEndStr }
      )
    } catch (err) {
      logger.error({ err, userId }, 'Failed to send power rankings notification')
    }
  }

  // Build a lookup of user data for email personalization
  const userDataMap = {}
  for (let i = 0; i < weeklyData.top5.length; i++) {
    const u = weeklyData.top5[i]
    userDataMap[u.user_id] = { rank: i + 1, ...u }
  }
  if (weeklyData.pickOfWeekUser) userDataMap[weeklyData.pickOfWeekUser.user_id] = userDataMap[weeklyData.pickOfWeekUser.user_id] || weeklyData.pickOfWeekUser
  if (weeklyData.biggestFallUser) userDataMap[weeklyData.biggestFallUser.user_id] = userDataMap[weeklyData.biggestFallUser.user_id] || weeklyData.biggestFallUser
  if (weeklyData.longestStreakUser) userDataMap[weeklyData.longestStreakUser.user_id] = userDataMap[weeklyData.longestStreakUser.user_id] || weeklyData.longestStreakUser

  const baseUrl = env.CORS_ORIGIN.split(',')[0].trim()

  // Send personalized emails
  try {
    await sendEmailToUserIds(featuredUserIds, (userId) => {
      const userData = userDataMap[userId]
      const name = userData?.display_name || userData?.username || 'Baller'
      const rank = userData?.rank
      const record = userData?.record
      const points = userData?.weekly_points

      let personalLine = ''
      if (rank) {
        personalLine = `You landed at <strong>#${rank}</strong> after going <strong>${record.wins}-${record.losses}</strong> and earning <strong>${points > 0 ? '+' : ''}${points} points</strong> this week.`
      } else {
        personalLine = `You earned a special mention in this week's awards section.`
      }

      const subject = "You're I KNOW BALL Famous!"
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h1 style="font-size: 24px; margin-bottom: 8px;">Weekly Power Rankings</h1>
          <p style="color: #aaa; font-size: 16px; margin-bottom: 24px;">
            Hey <strong>${name}</strong>, you made this week's Power Rankings on I KNOW BALL!
          </p>
          <p style="font-size: 15px; color: #ccc; margin-bottom: 24px;">
            ${personalLine}
          </p>
          <a href="${baseUrl}"
             style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            See Full Rankings
          </a>
          <p style="color: #888; font-size: 13px; margin-top: 24px;">
            Keep making picks to hold your spot next week.
          </p>
        </div>
      `

      return { subject, html }
    })
  } catch (err) {
    logger.error({ err }, 'Failed to send recap emails')
  }

  logger.info({ weekStart: weekStartStr, featured: featuredUserIds.length }, 'Weekly recap generated successfully')
}
