import { google } from 'googleapis'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const PACKAGE_NAME = 'com.iknowball.app'

// Lazy-initialized Android Publisher client. Single instance reused for
// the lifetime of the server process — googleapis JWT auth caches its
// access token internally, so we want one auth client, not per-request.
let publisher = null

function getPublisher() {
  if (publisher) return publisher
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    logger.warn('GOOGLE_SERVICE_ACCOUNT_JSON not configured — Android IAP verification disabled')
    return null
  }
  try {
    const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    })
    publisher = google.androidpublisher({ version: 'v3', auth })
    logger.info({ clientEmail: credentials.client_email, projectId: credentials.project_id }, 'Google Play publisher initialized')
    return publisher
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Google Play publisher construction threw')
    return null
  }
}

/**
 * Fetch the current state of a subscription purchase from Play, then
 * acknowledge it if not yet acknowledged. Acknowledgement is REQUIRED
 * within 3 days of purchase or Play auto-refunds the user — so the
 * verify + acknowledge pair runs together in this single call.
 *
 * Uses the v2 subscriptions API (current recommended) for the fetch.
 * Acknowledgement uses the v1 endpoint which is still the canonical
 * path for both v1 and v2 subscription purchases.
 *
 * Returns an object shaped like:
 *   {
 *     productId: 'com.iknowball.app.monthly',
 *     orderId: 'GPA.XXXX-XXXX-XXXX-XXXXX',
 *     expiryTime: '2026-07-20T12:00:00Z',
 *     subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
 *     autoRenewing: true,
 *   }
 *
 * Throws on any API failure — caller is responsible for surfacing the
 * error to the client.
 */
export async function verifyAndAcknowledgePurchase(productId, purchaseToken) {
  const p = getPublisher()
  if (!p) throw new Error('Google Play publisher not configured')

  // Fetch the subscription record. v2 endpoint returns lineItems with
  // per-product details — IKB only has one product per subscription so
  // we always read lineItems[0].
  const { data: sub } = await p.purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token: purchaseToken,
  })

  if (!sub) throw new Error('Empty response from Play subscriptionsv2.get')

  const lineItem = (sub.lineItems || [])[0]
  if (!lineItem) throw new Error('No line items on subscription purchase')

  // Acknowledge if Play still considers it pending. ACKNOWLEDGEMENT_STATE_PENDING
  // means we haven't told Play "we received this purchase" yet —
  // critical to do this within 3 days of purchase or Play refunds.
  if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    try {
      await p.purchases.subscriptions.acknowledge({
        packageName: PACKAGE_NAME,
        subscriptionId: lineItem.productId,
        token: purchaseToken,
      })
      logger.info({ productId: lineItem.productId, orderId: sub.latestOrderId }, 'Google IAP: acknowledged purchase')
    } catch (ackErr) {
      // Acknowledgement failure is logged but doesn't fail the
      // verification — better to grant access on a verified-but-
      // unacknowledged purchase than to deny the user. Play will retry
      // until success or 3-day timeout.
      logger.error({ err: ackErr.message, productId: lineItem.productId }, 'Google IAP: acknowledgement failed')
    }
  }

  return {
    productId: lineItem.productId,
    orderId: sub.latestOrderId,
    expiryTime: lineItem.expiryTime,
    subscriptionState: sub.subscriptionState,
    autoRenewing: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
    regionCode: sub.regionCode,
  }
}

/**
 * Re-fetch a subscription's state from Play. Used by the RTDN webhook
 * to get authoritative state when a notification arrives (the
 * notification itself contains only the type + token, not the
 * subscription details).
 *
 * Returns the same shape as verifyAndAcknowledgePurchase but does NOT
 * acknowledge — used for renewals, cancellations, refunds where the
 * original purchase is already long-since acknowledged.
 */
export async function getSubscriptionState(purchaseToken) {
  const p = getPublisher()
  if (!p) throw new Error('Google Play publisher not configured')

  const { data: sub } = await p.purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token: purchaseToken,
  })

  if (!sub) throw new Error('Empty response from Play subscriptionsv2.get')

  const lineItem = (sub.lineItems || [])[0]
  if (!lineItem) throw new Error('No line items on subscription purchase')

  return {
    productId: lineItem.productId,
    orderId: sub.latestOrderId,
    expiryTime: lineItem.expiryTime,
    subscriptionState: sub.subscriptionState,
    autoRenewing: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
    regionCode: sub.regionCode,
  }
}
