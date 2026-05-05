import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'

// Squares is single-game and explicitly never awards a global bonus, so we
// don't run the warning/auto-cancel flow on it. Every other format requires
// at least 2 distinct members for a competitive league.
const EXEMPT_FORMATS = new Set(['squares'])

const WARNING_LEAD_MS = 6 * 60 * 60 * 1000 // 6 hours before starts_at

/**
 * Find leagues that:
 *  - have status='open' or 'active'
 *  - have exactly one member (the commissioner)
 *  - aren't squares
 *  - have starts_at coming up within WARNING_LEAD_MS
 *  - haven't already been warned (solo_warning_sent_at is null)
 *
 * Send the commissioner a heads-up notification suggesting concrete next
 * steps (delay start date, switch to open visibility) and stamp the
 * solo_warning_sent_at column so we don't re-fire on the next tick.
 */
export async function processSoloLeagueWarnings() {
  const now = new Date()
  const cutoff = new Date(now.getTime() + WARNING_LEAD_MS).toISOString()

  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('id, name, format, sport, visibility, starts_at, commissioner_id, solo_warning_sent_at, status')
    .in('status', ['open', 'active'])
    .is('solo_warning_sent_at', null)
    .not('starts_at', 'is', null)
    .lt('starts_at', cutoff)
    .gt('starts_at', now.toISOString())

  if (error) {
    logger.error({ err: error }, 'Solo-league warning fetch failed')
    return
  }

  for (const league of leagues || []) {
    if (EXEMPT_FORMATS.has(league.format)) continue

    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', league.id)

    if ((count || 0) !== 1) continue

    const isClosed = league.visibility !== 'open'
    const tips = []
    tips.push('push the start date back from the gear icon')
    if (isClosed) tips.push("switch the league to 'open' visibility so people can find it on the home page")
    tips.push('share the invite code')
    const tipText = tips.length > 1
      ? tips.slice(0, -1).join(', ') + ', or ' + tips[tips.length - 1]
      : tips[0]

    const message = `${league.name} is at risk of being canceled — nobody else has joined yet. To save it: ${tipText}. If it's still solo when the league starts, it'll auto-cancel.`

    try {
      await createNotification(league.commissioner_id, 'league_at_risk', message, {
        leagueId: league.id,
        leagueName: league.name,
        startsAt: league.starts_at,
      })

      await supabase
        .from('leagues')
        .update({ solo_warning_sent_at: new Date().toISOString() })
        .eq('id', league.id)

      logger.info({ leagueId: league.id }, 'Solo-league warning sent')
    } catch (err) {
      logger.error({ err, leagueId: league.id }, 'Failed to send solo-league warning')
    }
  }
}

/**
 * Find leagues that:
 *  - have status='open' or 'active'
 *  - have exactly one member
 *  - aren't squares
 *  - have starts_at <= now (the moment to make the call has arrived)
 *
 * Cancel them: notify the commissioner, then delete the league row (cascades
 * to picks / settings / etc.).
 */
export async function autoCancelSoloLeagues() {
  const now = new Date().toISOString()

  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('id, name, format, commissioner_id, status')
    .in('status', ['open', 'active'])
    .not('starts_at', 'is', null)
    .lte('starts_at', now)

  if (error) {
    logger.error({ err: error }, 'Solo-league auto-cancel fetch failed')
    return
  }

  for (const league of leagues || []) {
    if (EXEMPT_FORMATS.has(league.format)) continue

    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', league.id)

    if ((count || 0) !== 1) continue

    try {
      await createNotification(
        league.commissioner_id,
        'league_canceled_solo',
        `${league.name} was canceled — no one else joined before the start time. You can create another league anytime.`,
        { leagueName: league.name, format: league.format }
      )

      // Cascades to league_members, picks, settings, etc.
      await supabase.from('leagues').delete().eq('id', league.id)
      logger.info({ leagueId: league.id, format: league.format }, 'Solo league auto-canceled')
    } catch (err) {
      logger.error({ err, leagueId: league.id }, 'Failed to auto-cancel solo league')
    }
  }
}

export async function processSoloLeagues() {
  await processSoloLeagueWarnings()
  await autoCancelSoloLeagues()
}
