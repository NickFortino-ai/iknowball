import admin from 'firebase-admin'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

// Lazy-initialized Firebase Admin SDK. Single app instance reused for the
// lifetime of the server process — admin.initializeApp() must only be
// called once per app name.
let fcmApp = null

function getFcm() {
  if (fcmApp) return fcmApp
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    logger.warn('FCM env not configured — Android native push disabled')
    return null
  }
  try {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)
    fcmApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
    logger.info({ projectId: serviceAccount.project_id, clientEmail: serviceAccount.client_email }, 'FCM admin initialized')
    return fcmApp
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'FCM admin construction threw')
    return null
  }
}

/**
 * Send an FCM push to all Android device tokens registered for a user.
 * Mirrors sendApnsToUser. Cleans up dead tokens on UNREGISTERED /
 * INVALID_ARGUMENT responses so we don't retry them forever.
 *
 * @param {string} userId
 * @param {string} title
 * @param {string} body
 * @param {string} [url] — deep-link payload for tap handler (matches APNs)
 */
export async function sendFcmToUser(userId, title, body, url) {
  const app = getFcm()
  if (!app) {
    logger.warn({ userId }, 'FCM send skipped — admin not configured')
    return
  }

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, token')
    .eq('user_id', userId)
    .eq('platform', 'android')

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch device tokens for FCM')
    return
  }
  if (!tokens?.length) {
    logger.info({ userId }, 'FCM send skipped — no Android device tokens for user')
    return
  }

  logger.info({ userId, tokenCount: tokens.length }, 'FCM send: attempting')

  const deviceTokens = tokens.map((t) => t.token)
  const message = {
    notification: { title, body },
    data: url ? { url } : {},
    tokens: deviceTokens,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        // Channel matches the default Capacitor push-notifications channel.
        channelId: 'default',
      },
    },
  }

  let result
  try {
    result = await admin.messaging(app).sendEachForMulticast(message)
  } catch (err) {
    logger.error({ err: err.message, userId }, 'FCM send threw')
    return
  }
  logger.info({ userId, sent: result.successCount, failed: result.failureCount }, 'FCM send: completed')

  // Clean up dead tokens. FCM returns specific error codes when a token
  // is no longer valid — usually because the app was uninstalled or the
  // user revoked notifications. Drop those rows so we stop trying.
  if (result.failureCount > 0) {
    const deadTokenIds = []
    result.responses.forEach((resp, i) => {
      if (resp.success) return
      const code = resp.error?.code
      const isDead = code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token'
        || code === 'messaging/invalid-argument'
      if (isDead) {
        deadTokenIds.push(tokens[i].id)
      } else {
        logger.warn({ userId, token: tokens[i].token, errorCode: code, errorMessage: resp.error?.message }, 'FCM send: non-fatal failure')
      }
    })
    if (deadTokenIds.length) {
      await supabase.from('device_tokens').delete().in('id', deadTokenIds)
      logger.info({ count: deadTokenIds.length, userId }, 'Removed expired FCM tokens')
    }
  }
}

/**
 * Android doesn't have an icon-badge concept like iOS — there's no
 * equivalent of sendApnsBadgeUpdate. Kept as a named no-op so callers can
 * fan out across both platforms uniformly without platform branches.
 */
export async function sendFcmBadgeUpdate() {
  // intentional no-op
}
