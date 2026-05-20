import { Router } from 'express'
import express from 'express'
import Stripe from 'stripe'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { verifyNotification, verifyTransactionLoose, verifyRenewalInfo } from '../services/appleIapService.js'

const router = Router()
const stripe = new Stripe(env.STRIPE_SECRET_KEY)

router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature']

    let event
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      logger.error({ err }, 'Stripe webhook signature verification failed')
      return res.status(400).json({ error: 'Invalid signature' })
    }

    const obj = event.data.object

    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = obj.metadata?.user_id
        if (!userId) {
          logger.warn({ sessionId: obj.id }, 'Checkout session missing user_id metadata')
          break
        }

        // For subscription checkouts, the subscription is handled by subscription events
        // But we set is_paid immediately so the user isn't blocked
        if (obj.mode === 'subscription') {
          await supabase
            .from('users')
            .update({
              is_paid: true,
              payment_source: 'stripe',
              subscription_status: 'active',
              subscription_plan: obj.metadata?.plan || 'monthly',
            })
            .eq('id', userId)

          logger.info({ userId, sessionId: obj.id }, 'Subscription checkout completed')
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const customerId = obj.customer
        const userId = obj.metadata?.user_id

        // Find user by stripe_customer_id or metadata
        let targetUserId = userId
        if (!targetUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle()
          targetUserId = user?.id
        }

        if (!targetUserId) {
          logger.warn({ customerId, subscriptionId: obj.id }, 'Cannot find user for subscription')
          break
        }

        const status = obj.status // 'active', 'past_due', 'canceled', 'unpaid', 'trialing'
        const currentPeriodEnd = obj.current_period_end
          ? new Date(obj.current_period_end * 1000).toISOString()
          : null

        // Determine plan from price
        const priceId = obj.items?.data?.[0]?.price?.id
        const yearlyPriceId = env.STRIPE_YEARLY_PRICE_ID || 'price_1TIMMxCdrW8CXAu2z4smZ8fD'
        const plan = priceId === yearlyPriceId ? 'yearly' : 'monthly'

        const updateData = {
          subscription_status: status === 'active' || status === 'trialing' ? 'active' : status === 'canceled' ? 'cancelled' : 'expired',
          subscription_expires_at: currentPeriodEnd,
          subscription_plan: plan,
          is_paid: status === 'active' || status === 'trialing',
          stripe_customer_id: customerId,
        }

        await supabase
          .from('users')
          .update(updateData)
          .eq('id', targetUserId)

        logger.info({ userId: targetUserId, status, plan, expiresAt: currentPeriodEnd }, 'Subscription updated')
        break
      }

      case 'customer.subscription.deleted': {
        const customerId = obj.customer
        const userId = obj.metadata?.user_id

        let targetUserId = userId
        if (!targetUserId) {
          const { data: user } = await supabase
            .from('users')
            .select('id, is_lifetime')
            .eq('stripe_customer_id', customerId)
            .maybeSingle()
          targetUserId = user?.id
          // Don't revoke lifetime users
          if (user?.is_lifetime) {
            logger.info({ userId: targetUserId }, 'Subscription deleted but user is lifetime — no change')
            break
          }
        }

        if (!targetUserId) break

        const expiresAt = obj.current_period_end
          ? new Date(obj.current_period_end * 1000).toISOString()
          : new Date().toISOString()

        await supabase
          .from('users')
          .update({
            subscription_status: 'cancelled',
            subscription_expires_at: expiresAt,
            // Keep is_paid = true until expiration — access check uses subscription_expires_at
          })
          .eq('id', targetUserId)

        logger.info({ userId: targetUserId, expiresAt }, 'Subscription cancelled — access until period end')
        break
      }

      case 'invoice.payment_succeeded': {
        // Subscription renewal
        const customerId = obj.customer
        const subscriptionId = obj.subscription

        if (!subscriptionId) break

        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (!user) break

        // Fetch subscription to get new period end
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId)
          const newExpiry = new Date(sub.current_period_end * 1000).toISOString()

          await supabase
            .from('users')
            .update({
              subscription_status: 'active',
              subscription_expires_at: newExpiry,
              is_paid: true,
            })
            .eq('id', user.id)

          logger.info({ userId: user.id, newExpiry }, 'Subscription renewed')
        } catch (err) {
          logger.error({ err, userId: user.id }, 'Failed to process renewal')
        }
        break
      }

      case 'invoice.payment_failed': {
        const customerId = obj.customer
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (user) {
          logger.warn({ userId: user.id }, 'Subscription payment failed')
          // Don't immediately revoke — Stripe will retry. Just log for now.
        }
        break
      }

      default:
        logger.debug({ type: event.type }, 'Unhandled Stripe webhook event')
    }

    res.json({ received: true })
  }
)

// App Store Server Notifications v2 — Apple posts here on every
// subscription state change (renew, expire, refund, revoke, etc).
// Configure the URL in App Store Connect → App Information →
// App Store Server Notifications → Production / Sandbox Server URL.
//
// Body is JSON ({ signedPayload }), so we use express.json here.
// Notifications are signed — `verifyNotification` walks the JWS and
// throws if the chain doesn't verify against Apple's root certs.
//
// Always ACK with 200 once we've signed-verified the payload, even if
// our DB update fails — Apple will retry indefinitely on non-200, and
// a duplicate webhook on a transient DB error would clog the queue.
router.post(
  '/apple-iap',
  express.json({ limit: '512kb' }),
  async (req, res) => {
    const { signedPayload } = req.body || {}
    if (!signedPayload) {
      return res.status(400).json({ error: 'signedPayload required' })
    }

    let notif
    try {
      notif = await verifyNotification(signedPayload)
    } catch (err) {
      logger.warn({ err: err.message }, 'Apple notification verification failed')
      return res.status(400).json({ error: 'Invalid notification signature' })
    }

    const type = notif.notificationType
    const data = notif.data || {}
    const subtype = notif.subtype

    try {
      let tx = null
      if (data.signedTransactionInfo) {
        tx = await verifyTransactionLoose(data.signedTransactionInfo)
      }
      let renewal = null
      if (data.signedRenewalInfo) {
        renewal = await verifyRenewalInfo(data.signedRenewalInfo)
      }

      const originalTxId = tx?.originalTransactionId || renewal?.originalTransactionId
      if (!originalTxId) {
        logger.warn({ type, subtype }, 'Apple notification missing originalTransactionId')
        return res.json({ received: true })
      }

      // Look up the user we previously associated with this transaction
      const { data: user } = await supabase
        .from('users')
        .select('id, subscription_status, is_paid')
        .eq('apple_original_transaction_id', originalTxId)
        .maybeSingle()

      if (!user) {
        // No user — could be a TestFlight notification before we
        // persisted the original purchase, or a transaction tied to a
        // deleted account. Log and ACK.
        logger.info({ type, subtype, originalTxId }, 'Apple notification for unknown txId')
        return res.json({ received: true })
      }

      const productId = tx?.productId || ''
      const isYearly = productId.includes('yearly') || productId.includes('annual')

      const updates = { updated_at: new Date().toISOString() }

      switch (type) {
        case 'DID_RENEW': {
          // Successful renewal — bump expiry, keep them paid.
          if (tx?.expiresDate) {
            updates.subscription_expires_at = new Date(tx.expiresDate).toISOString()
          }
          if (productId) updates.subscription_plan = isYearly ? 'yearly' : 'monthly'
          updates.is_paid = true
          updates.subscription_status = 'active'
          break
        }
        case 'EXPIRED':
        case 'GRACE_PERIOD_EXPIRED': {
          // No more access — subscription lapsed.
          updates.is_paid = false
          updates.subscription_status = 'expired'
          break
        }
        case 'REFUND':
        case 'REVOKE': {
          // Apple refunded the user or revoked family-sharing access.
          updates.is_paid = false
          updates.subscription_status = 'refunded'
          break
        }
        case 'REFUND_REVERSED': {
          // Apple reversed a previous refund — restore access. Don't
          // shift expires_at; the underlying period is unchanged.
          updates.is_paid = true
          updates.subscription_status = 'active'
          break
        }
        case 'DID_CHANGE_RENEWAL_PREF': {
          // User toggled plan (monthly ↔ yearly). New plan applies on
          // next renewal; record it so the UI matches the user's intent.
          if (renewal?.autoRenewProductId) {
            const next = renewal.autoRenewProductId
            updates.subscription_plan =
              (next.includes('yearly') || next.includes('annual')) ? 'yearly' : 'monthly'
          }
          break
        }
        case 'DID_CHANGE_RENEWAL_STATUS': {
          // User turned auto-renew off or on. Doesn't change access yet,
          // but record so we can surface a "cancels Oct 5" UI later.
          updates.auto_renew_enabled = renewal?.autoRenewStatus === 1
          break
        }
        case 'SUBSCRIBED':
        case 'DID_RECOVER': {
          // Re-subscribed after a lapse or recovered from billing retry.
          if (tx?.expiresDate) {
            updates.subscription_expires_at = new Date(tx.expiresDate).toISOString()
          }
          if (productId) updates.subscription_plan = isYearly ? 'yearly' : 'monthly'
          updates.is_paid = true
          updates.subscription_status = 'active'
          break
        }
        default:
          logger.info({ type, subtype, userId: user.id }, 'Apple notification — no state change applied')
          return res.json({ received: true })
      }

      const { error: updErr } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id)

      if (updErr) {
        logger.error({ err: updErr, userId: user.id, type }, 'Failed to apply Apple notification update')
        // Still 200 — see note above about Apple retry behavior.
      } else {
        logger.info({ userId: user.id, type, subtype, updates }, 'Apple notification applied')
      }

      res.json({ received: true })
    } catch (err) {
      logger.error({ err, type, subtype }, 'Apple notification handler error')
      res.status(200).json({ received: true })
    }
  }
)

export default router
