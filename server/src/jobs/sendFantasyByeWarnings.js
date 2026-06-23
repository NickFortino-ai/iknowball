import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getCurrentNflWeek } from '../services/tdPassService.js'
import { createNotification } from '../services/notificationService.js'

/**
 * Fantasy bye-week warning.
 *
 * Once per Thursday morning during the NFL regular season, check every
 * active traditional fantasy league's lineups. For any user whose CURRENT
 * starting lineup (non-bench, non-IR) contains players whose nfl_players
 * .bye_week matches the current NFL week, send ONE consolidated notification
 * naming all the bye-week starters. Dedupes per (user, league, week) so
 * re-running the cron — or a Thursday morning manual trigger — won't spam.
 *
 * Salary cap leagues skipped: their lineups are by-design re-set every week
 * and the bye implications are inherent to the pricing model.
 *
 * Playoff weeks skipped: by playoff time, NFL byes are over.
 */
export async function sendFantasyByeWarnings() {
  logger.info('Starting fantasy bye-week warnings')

  const { season, week, isPreSeason } = await getCurrentNflWeek()
  if (isPreSeason) {
    logger.info({ season, week }, 'Pre-season — skipping fantasy bye warnings')
    return { sent: 0 }
  }

  // NFL byes happen weeks ~5-14. Outside that range, skip the entire scan.
  if (week < 4 || week > 14) {
    logger.info({ week }, 'Outside bye-week window — skipping fantasy bye warnings')
    return { sent: 0 }
  }

  // Find active traditional fantasy leagues for this season
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('format', 'fantasy')
    .eq('status', 'active')
  if (!leagues?.length) return { sent: 0 }

  // Filter to traditional (not salary cap), get settings batch
  const leagueIds = leagues.map((l) => l.id)
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('league_id, format, season, current_week, playoff_start_week')
    .in('league_id', leagueIds)
  const settingsByLeague = {}
  for (const s of settings || []) settingsByLeague[s.league_id] = s

  const eligibleLeagues = leagues.filter((l) => {
    const s = settingsByLeague[l.id]
    if (!s) return false
    if (s.format === 'salary_cap') return false
    if (s.season !== season) return false
    // Skip if in playoffs (no byes during playoffs)
    if ((s.playoff_start_week || 15) <= week) return false
    return true
  })

  if (!eligibleLeagues.length) {
    logger.info({ scanned: leagues.length }, 'No eligible traditional fantasy leagues for bye warnings')
    return { sent: 0 }
  }

  // For each eligible league, get rosters (joined to bye_week)
  const eligibleIds = eligibleLeagues.map((l) => l.id)
  const { data: rosters } = await supabase
    .from('fantasy_rosters')
    .select('league_id, user_id, slot, player_id, nfl_players(full_name, bye_week, position)')
    .in('league_id', eligibleIds)

  // Group bye-week starters per (league, user)
  const grouped = {} // `${leagueId}|${userId}` → { leagueId, leagueName, userId, players: [{name, position}] }
  for (const r of rosters || []) {
    const slot = (r.slot || '').toLowerCase()
    if (slot === 'bench' || slot.startsWith('bench')) continue
    if (slot === 'ir' || slot.startsWith('ir')) continue
    const player = r.nfl_players
    if (!player) continue
    if (player.bye_week !== week) continue
    const key = `${r.league_id}|${r.user_id}`
    if (!grouped[key]) {
      const league = eligibleLeagues.find((l) => l.id === r.league_id)
      grouped[key] = {
        leagueId: r.league_id,
        leagueName: league?.name || 'your league',
        userId: r.user_id,
        players: [],
      }
    }
    grouped[key].players.push({ name: player.full_name, position: player.position })
  }

  // Dedupe against existing warnings for this week. Notification metadata
  // carries leagueId + week so we can match prior sends precisely.
  let sent = 0
  for (const entry of Object.values(grouped)) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', entry.userId)
      .eq('type', 'fantasy_bye_warning')
      .contains('metadata', { leagueId: entry.leagueId, week })
      .limit(1)
    if (existing?.length) continue

    const names = entry.players.map((p) => p.name).join(', ')
    const msg = entry.players.length === 1
      ? `${names} is on bye this week and is in your ${entry.leagueName} starting lineup`
      : `${entry.players.length} of your ${entry.leagueName} starters are on bye this week: ${names}`

    try {
      await createNotification(entry.userId, 'fantasy_bye_warning', msg, {
        leagueId: entry.leagueId,
        week,
        playerCount: entry.players.length,
      })
      sent++
    } catch (err) {
      logger.error({ err, userId: entry.userId, leagueId: entry.leagueId }, 'Failed to send fantasy bye warning')
    }
  }

  logger.info({ season, week, leagues: eligibleLeagues.length, sent }, 'Fantasy bye warnings complete')
  return { sent }
}
