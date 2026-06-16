import apn from 'apn'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

// Lazy-initialized APNs provider. Keeping it module-level so we reuse a
// single HTTP/2 connection pool across the lifetime of the server process.
let provider = null

function getProvider() {
  if (provider) return provider
  if (!env.APNS_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID) {
    logger.warn('APNs env not configured — native push disabled')
    return null
  }
  try {
    provider = new apn.Provider({
      token: {
        key: env.APNS_KEY,
        keyId: env.APNS_KEY_ID,
        teamId: env.APNS_TEAM_ID,
      },
      production: env.APNS_PRODUCTION,
    })
    logger.info({ keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, production: env.APNS_PRODUCTION, keyLength: env.APNS_KEY?.length, keyStartsWith: env.APNS_KEY?.slice(0, 40), keyHasLiteralBackslashN: env.APNS_KEY?.includes('\\n') }, 'APNs provider initialized')
    return provider
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack, keyLength: env.APNS_KEY?.length, keyStartsWith: env.APNS_KEY?.slice(0, 40), keyHasLiteralBackslashN: env.APNS_KEY?.includes('\\n') }, 'APNs provider construction threw')
    return null
  }
}

/**
 * Send an APNs push to all device tokens registered for a user. Handles
 * token cleanup on 410 Unregistered responses so we don't retry dead
 * tokens forever.
 *
 * @param {string} userId
 * @param {string} title
 * @param {string} body
 * @param {string} [url] — deep-link payload for tap handler
 * @param {number} [badge] — badge count to set on the app icon. Defaults
 *   to the user's current unread notification count; pass an explicit
 *   value to override (e.g. 0 to clear).
 */
export async function sendApnsToUser(userId, title, body, url, badge) {
  const p = getProvider()
  if (!p) {
    logger.warn({ userId }, 'APNs send skipped — provider not configured')
    return
  }

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, token')
    .eq('user_id', userId)
    .eq('platform', 'ios')

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch device tokens for APNs')
    return
  }
  if (!tokens?.length) {
    logger.info({ userId }, 'APNs send skipped — no iOS device tokens for user')
    return
  }

  // If caller didn't supply a badge, count current unread notifications so
  // the icon badge reflects reality. Hardcoded badge=1 (the old behavior)
  // caused the "icon always shows 1" complaint — every new push reset the
  // count to 1, and nothing ever cleared it.
  let badgeCount = badge
  if (badgeCount == null) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    badgeCount = count || 0
  }

  logger.info({ userId, tokenCount: tokens.length, badge: badgeCount, production: env.APNS_PRODUCTION, bundleId: env.APNS_BUNDLE_ID }, 'APNs send: attempting')

  const note = new apn.Notification()
  note.alert = { title, body }
  note.sound = 'default'
  note.badge = badgeCount
  note.topic = env.APNS_BUNDLE_ID
  // Payload picked up by the client — used to deep-link when the user
  // taps the notification.
  if (url) note.payload = { url }

  const deviceTokens = tokens.map((t) => t.token)
  let result
  try {
    result = await p.send(note, deviceTokens)
  } catch (err) {
    logger.error({ err, userId }, 'APNs send threw')
    return
  }
  logger.info({ userId, sent: result.sent?.length || 0, failed: result.failed?.length || 0, failures: result.failed }, 'APNs send: completed')

  // Clean up unregistered tokens — Apple tells us when a device has
  // uninstalled the app or revoked notifications so we can stop sending.
  if (result.failed?.length) {
    const deadTokens = result.failed
      .filter((f) => f.status === '410' || f.response?.reason === 'BadDeviceToken' || f.response?.reason === 'Unregistered')
      .map((f) => f.device)
    if (deadTokens.length) {
      const deadIds = tokens.filter((t) => deadTokens.includes(t.token)).map((t) => t.id)
      if (deadIds.length) {
        await supabase.from('device_tokens').delete().in('id', deadIds)
        logger.info({ count: deadIds.length, userId }, 'Removed expired APNs tokens')
      }
    }
    const otherFailures = result.failed.filter((f) => !deadTokens.includes(f.device))
    if (otherFailures.length) {
      logger.warn({ failures: otherFailures, userId }, 'APNs send had non-fatal failures')
    }
  }
}

/**
 * Send a silent push to update only the app icon badge — no alert, no
 * sound. Used when the user marks notifications read in-app so the
 * "1 stuck on the icon" effect clears without waiting for the next
 * real notification. iOS treats this as a content-available push.
 */
export async function sendApnsBadgeUpdate(userId, count) {
  const p = getProvider()
  if (!p) return

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, token')
    .eq('user_id', userId)
    .eq('platform', 'ios')

  if (error || !tokens?.length) return

  const note = new apn.Notification()
  note.topic = env.APNS_BUNDLE_ID
  // iOS 13+ requires apns-push-type: background for silent updates,
  // and Apple drops the push if the header is missing. The apn library
  // doesn't set it automatically for content-available pushes — set
  // both pushType and priority explicitly so iOS reliably processes
  // the badge change.
  note.pushType = 'background'
  note.priority = 5
  note.contentAvailable = true
  note.badge = count
  // No alert / sound — this is a silent badge-only update.

  try {
    const result = await p.send(note, tokens.map((t) => t.token))
    logger.info({ userId, badgeCount: count, sent: result.sent?.length || 0, failed: result.failed?.length || 0, failures: result.failed }, 'APNs badge-update: completed')
  } catch (err) {
    logger.error({ err, userId }, 'APNs badge-update push threw')
  }
}
