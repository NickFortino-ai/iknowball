import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { sportLabel } from '../services/surveyService.js'

/**
 * Nudge survey-enabled league members to fill out the exit survey, 24h
 * after the league's ends_at. Fires ONCE per (user, league). We mark
 * `notified_at` on the user_surveys row so re-runs skip.
 *
 * No early-end nudge — only after the league is officially over so the
 * "right now" Q4 phrasing actually reflects the post-experience state.
 *
 * Same overnight guard as other reminders (8 AM – 11 PM ET) to avoid
 * waking users up.
 */
export async function sendSurveyInviteNudges() {
  const now = new Date()
  const etHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
    10
  )
  if (etHour < 8 || etHour >= 23) return

  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Survey-enabled leagues whose ends_at was at least 24h ago.
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, sport, ends_at')
    .eq('survey_enabled', true)
    .lte('ends_at', cutoff)

  if (!leagues?.length) return

  let totalSent = 0
  for (const league of leagues) {
    const { data: members } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)
    if (!members?.length) continue

    const memberIds = members.map((m) => m.user_id)

    // Pull existing exit rows so we can skip anyone who already finished,
    // permanently dismissed, or was already nudged.
    const { data: existing } = await supabase
      .from('user_surveys')
      .select('user_id, submitted_at, dismissed_at, notified_at')
      .eq('league_id', league.id)
      .eq('survey_type', 'exit')

    const skip = new Set()
    for (const r of existing || []) {
      if (r.submitted_at || r.dismissed_at || r.notified_at) skip.add(r.user_id)
    }
    const toNudge = memberIds.filter((id) => !skip.has(id))
    if (!toNudge.length) continue

    const label = sportLabel(league.sport)
    const message = `Got 15 seconds? Quick follow-up survey for your ${label} league.`

    for (const userId of toNudge) {
      try {
        await createNotification(userId, 'survey_invite', message, {
          leagueId: league.id,
        })
        await supabase
          .from('user_surveys')
          .upsert({
            user_id: userId,
            league_id: league.id,
            survey_type: 'exit',
            notified_at: new Date().toISOString(),
          }, { onConflict: 'user_id,league_id,survey_type' })
        totalSent++
      } catch (err) {
        logger.error({ err, userId, leagueId: league.id }, 'Failed to send survey invite nudge')
      }
    }

    logger.info({ leagueId: league.id, sent: toNudge.length }, 'Survey invite nudges sent')
  }

  if (totalSent > 0) {
    logger.info({ totalSent }, 'Survey invite nudge job complete')
  }
}
