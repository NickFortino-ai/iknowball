import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { collectWeeklyData, generateRecapContent } from '../services/recapService.js'

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

  // Set visible_after to 1:00 PM Pacific on the current day (admin has until then to edit)
  const pacificDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const pacificNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'short' })
  const offset = pacificNow.includes('PDT') ? '-07:00' : '-08:00'
  const visibleAfter = new Date(`${pacificDate}T13:00:00${offset}`)

  // Save to DB (notifications/emails are sent separately after visible_after)
  const { error: insertError } = await supabase.from('weekly_recaps').insert({
    week_start: weekStartStr,
    week_end: weekEndStr,
    recap_content: recapContent,
    featured_user_ids: featuredUserIds,
    pick_of_week_user_id: weeklyData.pickOfWeekUser?.user_id || null,
    biggest_fall_user_id: weeklyData.biggestFallUser?.user_id || null,
    longest_streak_user_id: weeklyData.longestStreakUser?.user_id || null,
    crown_holders: weeklyData.currentCrownHolders || null,
    visible_after: visibleAfter.toISOString(),
  })

  if (insertError) {
    logger.error({ error: insertError }, 'Failed to save weekly recap')
    throw insertError
  }

  logger.info({ weekStart: weekStartStr, featured: featuredUserIds.length, visibleAfter: visibleAfter.toISOString() }, 'Weekly recap generated — notifications will be sent after visible_after')
}
