import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { sendPushNotification } from './pushService.js'
import { sendApnsToUser, sendApnsBadgeUpdate } from './apnsService.js'
import { sendFcmToUser } from './fcmService.js'

const PUSH_ELIGIBLE_TYPES = ['parlay_result', 'streak_milestone', 'futures_result', 'squares_quarter_win', 'record_broken', 'survivor_result', 'survivor_win', 'survivor_pick_reminder', 'roster_reminder', 'league_win', 'league_invitation', 'direct_message', 'league_thread_mention', 'league_report', 'nfl_injury_warning', 'fantasy_trade_proposed', 'fantasy_trade_accepted', 'fantasy_trade_declined', 'fantasy_waiver_awarded', 'fantasy_stat_correction', 'fantasy_draft_starting_soon', 'poll_response_milestone', 'og_welcome', 'bracket_published']

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
