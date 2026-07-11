import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { sendPushNotification } from './pushService.js'
import { sendApnsToUser, sendApnsBadgeUpdate } from './apnsService.js'
import { sendFcmToUser } from './fcmService.js'

const PUSH_ELIGIBLE_TYPES = ['parlay_result', 'streak_milestone', 'futures_result', 'squares_quarter_win', 'record_broken', 'survivor_result', 'survivor_win', 'survivor_pick_reminder', 'roster_reminder', 'league_win', 'league_invitation', 'direct_message', 'league_thread_mention', 'league_report', 'nfl_injury_warning', 'fantasy_trade_proposed', 'fantasy_trade_accepted', 'fantasy_trade_declined', 'fantasy_waiver_awarded', 'fantasy_stat_correction', 'fantasy_draft_starting_soon', 'poll_response_milestone', 'og_welcome', 'bracket_published', 'commissioner_report_reply']

// Types that respect quiet hours (10 PM – 8 AM PT). The DB row is still
// written so the user sees the notification in-app when they open the
// app in the morning — only the push fanout is skipped.
//
// Included:
// - survivor_result / survivor_win: both fire from real-time game-finish
//   paths AND catch-up crons. Even the game-finish case can land at
//   12–1 AM PT for late West Coast MLB. User sees result in-app.
// - fantasy_waiver_awarded: waivers clear Wed 3 AM ET (= midnight PT Wed).
//   User checks their team in the morning to see who they got.
// - fantasy_stat_correction: rare batch update, no urgency.
//
// NOT included (deliberately deliver during quiet hours):
// - direct_message, league_thread_mention, league_invitation,
//   fantasy_trade_*: user-initiated by another human, should deliver
//   whenever the other user acts.
// - parlay_result, record_broken, streak_milestone, futures_result,
//   nfl_injury_warning: rare or infrequent enough that late timing is
//   accepted as timely.
const QUIET_HOURS_TYPES = new Set([
  'survivor_result',
  'survivor_win',
  // League-completion notifications fire from the completeLeagues cron
  // whenever the last game in the window finalizes — which for late-slate
  // MLB can be 11 PM+ PT. Winners don't want to be woken up mid-night
  // for news that will be true when they wake up. league_finish is the
  // non-winner variant (podium placement) — same reasoning.
  'league_win',
  'league_finish',
  'fantasy_waiver_awarded',
  'fantasy_stat_correction',
])

function isCurrentlyQuietHoursPt() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  const hourStr = parts.find((p) => p.type === 'hour')?.value
  const ptHour = hourStr === '24' ? 0 : Number(hourStr)
  return ptHour >= 22 || ptHour < 8
}

export async function createNotification(userId, type, message, metadata = {}) {
  // Self-notification guard
  if (metadata.actorId === userId) return null

  const { data, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, type, message, metadata })
    .select()
    .single()

  if (error) {
    logger.error({ error, userId, type }, 'Failed to create notification')
    return null
  }

  // Send web push for eligible notification types
  if (PUSH_ELIGIBLE_TYPES.includes(type)) {
    // Quiet-hours gate — skip push (not the DB row) for catch-up types
    // during 10 PM – 8 AM PT. User sees the notification in-app when
    // they open the app.
    if (QUIET_HOURS_TYPES.has(type) && isCurrentlyQuietHoursPt()) {
      return data
    }
    try {
      const { data: user } = await supabase
        .from('users')
        .select('push_preferences')
        .eq('id', userId)
        .single()

      const prefs = user?.push_preferences
      // null preferences = all on; otherwise check the specific type
      if (!prefs || prefs[type] !== false) {
        // Trade-family notifications deep-link to the league's
        // Transactions → Trades sub-tab so the recipient lands right on
        // the approve/decline UI. Mirrors the Navbar in-app routing.
        const isFantasyTradeNotif = type === 'fantasy_trade_proposed'
          || type === 'fantasy_trade_accepted'
          || type === 'fantasy_trade_declined'
          || type === 'fantasy_trade_vetoed'
          || type === 'fantasy_trade_approved'

        const pushUrl = type === 'direct_message' ? '/messages'
        : type === 'record_broken' ? '/hall-of-fame?section=records'
        : type === 'poll_response_milestone' && metadata.hotTakeId
          ? `/hub?tab=highlights&scrollTo=hot_take-${metadata.hotTakeId}`
        : (isFantasyTradeNotif && metadata.leagueId)
          ? `/leagues/${metadata.leagueId}?tab=Transactions&subtab=trades`
        // Admin reply on a support ticket lands the commissioner directly
        // in their report thread. Client reads ?openReport=1 and routes to
        // the Commish tab (fantasy) or settings modal report view (others).
        : (type === 'commissioner_report_reply' && metadata.leagueId)
          ? `/leagues/${metadata.leagueId}?openReport=1`
        : metadata.leagueId ? `/leagues/${metadata.leagueId}` : '/results'
        // Fan out to all three transports. Web push → desktop PWA and
        // Safari users, APNs → native iOS app, FCM → native Android app.
        // Each service filters by its own `platform` value on device_tokens
        // so there's no double-delivery to a single device. Failures are
        // logged but don't block the notification row from being created.
        await Promise.allSettled([
          sendPushNotification(userId, 'I KNOW BALL', message, pushUrl),
          sendApnsToUser(userId, 'I KNOW BALL', message, pushUrl),
          sendFcmToUser(userId, 'I KNOW BALL', message, pushUrl),
        ])
      }
    } catch (pushError) {
      logger.error({ error: pushError, userId, type }, 'Failed to send push notification')
    }
  }

  return data
}

export async function getNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data || []
}

export async function getUnreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
  return count || 0
}

export async function markAllRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error

  // Silently clear the app icon badge — fire-and-forget; failure to
  // update the badge shouldn't fail the read operation.
  sendApnsBadgeUpdate(userId, 0).catch((err) =>
    logger.warn({ err, userId }, 'markAllRead: badge-clear push failed')
  )
}

export async function markRead(userId, notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)

  if (error) throw error

  // Update the icon badge to the new unread count so the number on the
  // app icon reflects what's left in the bell.
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  sendApnsBadgeUpdate(userId, count || 0).catch((err) =>
    logger.warn({ err, userId }, 'markRead: badge-update push failed')
  )
}
