import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { collectWeeklyData, generateRecapContent } from '../services/recapService.js'

function formatLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function generateWeeklyRecap() {
  logger.info('Starting weekly recap generation')

  // Calculate last week's window: last Monday 10:00 UTC → this Monday 09:59 UTC.
  // 10:00 UTC = 6 AM ET, so the window covers Mon 6 AM ET → next Mon 5:59 AM ET.
  // This fully captures Sunday evening / Sunday Night Football / late games that
  // settle after Sunday midnight UTC, which were previously excluded.
  const now = new Date()
  const dayOfWeekUTC = now.getUTCDay() // 0=Sun, 1=Mon
  // Days back to the most recent Monday (today if Monday)
  const daysBackToThisMonday = dayOfWeekUTC === 0 ? 6 : dayOfWeekUTC - 1
  // This Monday at 10:00 UTC (end of last week's window)
  const thisMonday10 = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBackToThisMonday,
    10, 0, 0, 0,
  ))
  // Last Monday at 10:00 UTC (start of last week's window)
  const lastMonday10 = new Date(thisMonday10.getTime() - 7 * 24 * 60 * 60 * 1000)
  // Window end is one millisecond before this Monday 10:00 UTC
  const lastWindowEnd = new Date(thisMonday10.getTime() - 1)

  const lastMonday = lastMonday10
  const lastSunday = lastWindowEnd

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

  // Generate AI recap content (with 1 retry). Returns { text, inputJson }.
  let recapResult
  try {
    recapResult = await generateRecapContent(weeklyData, weekStartStr, weekEndStr)
  } catch (err) {
    logger.warn({ err: err.message }, 'Claude API failed, retrying in 5s')
    await new Promise((r) => setTimeout(r, 5000))
    recapResult = await generateRecapContent(weeklyData, weekStartStr, weekEndStr)
  }
  const recapContent = recapResult.text
  const inputJson = recapResult.inputJson

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

  // Save to DB (notifications/emails are sent separately after visible_after).
  // input_json stores the exact payload Claude received — required for
  // auditing hallucinations (Claude could invent a game/score that's not
  // in the input; comparing against input_json is the only way to detect).
  const { error: insertError } = await supabase.from('weekly_recaps').insert({
    week_start: weekStartStr,
    week_end: weekEndStr,
    recap_content: recapContent,
    input_json: inputJson,
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
