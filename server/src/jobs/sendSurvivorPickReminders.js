import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'

/**
 * Survivor pick reminders.
 *
 * Fires once per (user, league_week) when:
 *  - the league is active
 *  - the current period is open (starts_at <= now <= ends_at)
 *  - the user is alive
 *  - the user hasn't submitted a pick for the current period
 *  - we haven't already sent a reminder for this (user, period)
 *
 * Dedupe is via the notifications table itself: each reminder writes
 * metadata.leagueWeekId, so a follow-up cron run sees the existing row
 * and skips. This makes the job idempotent — safe to run on any cadence.
 *
 * Guard: skip overnight (between midnight and 8 AM ET) so the push
 * doesn't wake users up. Most sports days have first kickoffs well
 * after 8 AM ET anyway, so this only delays the reminder by a few hours.
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
    // Current period: a week containing now
    const { data: weeks } = await supabase
      .from('league_weeks')
      .select('id, week_number, starts_at, ends_at')
      .eq('league_id', league.id)
      .lte('starts_at', nowIso)
      .gte('ends_at', nowIso)
      .limit(1)

    if (!weeks?.length) continue
    const currentWeek = weeks[0]

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
