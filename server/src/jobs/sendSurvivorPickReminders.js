import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'

/**
 * Survivor pick reminders.
 *
 * Fires ONCE PER USER, only on the league's first period (Day 1 / Week 1).
 * Users typically know to keep picking after Day 1; the goal is to catch
 * the day-of-launch case where members forgot to pick at all.
 *
 * Conditions to fire:
 *  - league is active
 *  - the FIRST period is currently open (starts_at <= now <= ends_at)
 *  - the user is alive
 *  - the user hasn't submitted a pick for the first period
 *  - we haven't already sent a reminder for this (user, period)
 *
 * Dedupe is via the notifications table itself: each reminder writes
 * metadata.leagueWeekId, so a follow-up cron run sees the existing row
 * and skips. The job is idempotent — safe to run on any cadence.
 *
 * Guard: skip overnight (before 8 AM ET, after 11 PM ET) so the push
 * doesn't wake users up. The 8 AM-11 PM window leaves 15 hours where
 * the reminder can fire — plenty of time to catch a Day-1 oversight.
 */
export async function sendSurvivorPickReminders() {
  const now = new Date()
  const etHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
    10
  )
  if (etHour < 8 || etHour >= 23) return

  const nowIso = now.toISOString()

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, settings')
    .eq('format', 'survivor')
    .eq('status', 'active')

  if (!leagues?.length) return

  let totalSent = 0
  for (const league of leagues) {
    // Only fire during the FIRST period — find the lowest week_number for
    // this league, then only proceed if that period is currently open.
    const { data: firstWeeks } = await supabase
      .from('league_weeks')
      .select('id, week_number, starts_at, ends_at')
      .eq('league_id', league.id)
      .order('week_number', { ascending: true })
      .limit(1)

    if (!firstWeeks?.length) continue
    const currentWeek = firstWeeks[0]
    const isOpenNow = currentWeek.starts_at <= nowIso && currentWeek.ends_at >= nowIso
    if (!isOpenNow) continue // first period hasn't started yet, or already ended

    const { data: members } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)
      .eq('is_alive', true)
    if (!members?.length) continue

    const memberIds = members.map((m) => m.user_id)

    const { data: picks } = await supabase
      .from('survivor_picks')
      .select('user_id')
      .eq('league_id', league.id)
      .eq('league_week_id', currentWeek.id)
      .in('user_id', memberIds)
    const pickedUserIds = new Set((picks || []).map((p) => p.user_id))

    const unpicked = memberIds.filter((id) => !pickedUserIds.has(id))
    if (!unpicked.length) continue

    // Existing reminders for this period (dedupe). We pull all reminders
    // for these users and filter on metadata.leagueWeekId client-side —
    // simpler than a JSONB query for a small batch.
    const { data: existing } = await supabase
      .from('notifications')
      .select('user_id, metadata')
      .eq('type', 'survivor_pick_reminder')
      .in('user_id', unpicked)
    const alreadyReminded = new Set(
      (existing || [])
        .filter((n) => n.metadata?.leagueWeekId === currentWeek.id)
        .map((n) => n.user_id)
    )

    const toRemind = unpicked.filter((id) => !alreadyReminded.has(id))
    if (!toRemind.length) continue

    const isDaily = league.settings?.pick_frequency === 'daily'
    const periodLabel = isDaily ? 'Day' : 'Week'
    const message = `${periodLabel} ${currentWeek.week_number}: make your pick in ${league.name}`

    for (const userId of toRemind) {
      try {
        await createNotification(userId, 'survivor_pick_reminder', message, {
          leagueId: league.id,
          leagueWeekId: currentWeek.id,
        })
        totalSent++
      } catch (err) {
        logger.error({ err, userId, leagueId: league.id }, 'Failed to send survivor pick reminder')
      }
    }

    logger.info({ leagueId: league.id, period: currentWeek.week_number, sent: toRemind.length }, 'Survivor pick reminders sent')
  }

  if (totalSent > 0) {
    logger.info({ totalSent }, 'Survivor pick reminder job complete')
  }
}
