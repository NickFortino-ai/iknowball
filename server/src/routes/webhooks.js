import { Router } from 'express'
import express from 'express'
import Stripe from 'stripe'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

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

export default router
