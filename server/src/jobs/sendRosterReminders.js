import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { checkUserReadiness } from '../services/rosterReadinessService.js'

// Roster reminder cron. Runs every 30 minutes.
//
// For each active (or upcoming) league, check every member's readiness
// for the current period. If they're not ready AND the period's first
// game starts within ~60–90 minutes from now, fire a roster_reminder
// notification. Dedupe by metadata.periodKey on the notifications
// table itself — running the cron again is safe.
//
// We skip survivor (covered by sendSurvivorPickReminders), squares,
// and bracket (different deadline mechanics).
//
// Quiet hours: skip overnight (before 8 AM, after 11 PM ET).

const REMINDER_WINDOW_MIN_MS = 30 * 60 * 1000  // earliest fire: 30 min before kickoff
const REMINDER_WINDOW_MAX_MS = 90 * 60 * 1000  // latest fire: 90 min before kickoff

const SKIP_FORMATS = new Set(['survivor', 'squares', 'bracket'])

async function getFantasySettings(leagueId, format) {
  const formatsWithSettings = new Set([
    'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts',
    'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles',
    'receptions', 'td_pass',
  ])
  if (!formatsWithSettings.has(format)) return null
  const { data } = await supabase
    .from('fantasy_settings')
    .select('*')
    .eq('league_id', leagueId)
    .maybeSingle()
  return data
}

export async function sendRosterReminders() {
  const now = new Date()
  const etHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
    10
  )
  if (etHour < 8 || etHour >= 23) return

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, format, status, settings, joins_locked_at')
    .in('status', ['upcoming', 'active'])

  if (!leagues?.length) return

  let totalSent = 0
  for (const league of leagues) {
    if (SKIP_FORMATS.has(league.format)) continue
    // For 'upcoming' leagues, only fire after joins_locked_at — earlier
    // than that the league is still accepting members and a "set your
    // roster" nudge is premature.
    if (league.status === 'upcoming') {
      if (!league.joins_locked_at || new Date(league.joins_locked_at) > now) continue
    }

    const fantasySettings = await getFantasySettings(league.id, league.format)
    const { data: members } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)
    if (!members?.length) continue

    // Run readiness checks for every member. The check returns the
    // shared firstGameAt + periodKey, so we can short-circuit the loop
    // once we know the period's first game is outside our window.
    for (const m of members) {
      let result
      try {
        result = await checkUserReadiness(league, fantasySettings, m.user_id)
      } catch (err) {
        logger.warn({ err: err.message, leagueId: league.id, userId: m.user_id }, 'Roster readiness check failed')
        continue
      }
      if (result.ready) continue

      const delta = new Date(result.firstGameAt).getTime() - now.getTime()
      if (delta < REMINDER_WINDOW_MIN_MS || delta > REMINDER_WINDOW_MAX_MS) continue

      // Dedupe — has this user already gotten this period's reminder?
      const { data: existing } = await supabase
        .from('notifications')
        .select('id, metadata')
        .eq('user_id', m.user_id)
        .eq('type', 'roster_reminder')
        .order('created_at', { ascending: false })
        .limit(50)
      const already = (existing || []).some((n) => n.metadata?.periodKey === result.periodKey)
      if (already) continue

      const message = `${result.reason} — ${league.name}`
      try {
        await createNotification(m.user_id, 'roster_reminder', message, {
          leagueId: league.id,
          periodKey: result.periodKey,
        })
        totalSent++
      } catch (err) {
        logger.error({ err, userId: m.user_id, leagueId: league.id }, 'Failed to send roster reminder')
      }
    }
  }

  if (totalSent > 0) {
    logger.info({ totalSent }, 'Roster reminder job complete')
  }
}
