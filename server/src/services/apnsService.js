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
  provider = new apn.Provider({
    token: {
      key: env.APNS_KEY,
      keyId: env.APNS_KEY_ID,
      teamId: env.APNS_TEAM_ID,
    },
    production: env.APNS_PRODUCTION,
  })
  return provider
}

/**
 * Send an APNs push to all device tokens registered for a user. Handles
 * token cleanup on 410 Unregistered responses so we don't retry dead
 * tokens forever.
 */
export async function sendApnsToUser(userId, title, body, url) {
  const p = getProvider()
  if (!p) return

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, token')
    .eq('user_id', userId)
    .eq('platform', 'ios')

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch device tokens for APNs')
    return
  }
  if (!tokens?.length) return

  const note = new apn.Notification()
  note.alert = { title, body }
  note.sound = 'default'
  note.badge = 1
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
