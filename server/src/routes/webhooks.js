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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.user_id

      if (!userId) {
        logger.warn({ sessionId: session.id }, 'Checkout session missing user_id metadata')
        return res.json({ received: true })
      }

      const { error } = await supabase
        .from('users')
        .update({ is_paid: true })
        .eq('id', userId)

      if (error) {
        logger.error({ error, userId }, 'Failed to update is_paid for user')
        return res.status(500).json({ error: 'Database update failed' })
      }

      logger.info({ userId, sessionId: session.id }, 'User marked as paid via Stripe webhook')
    }

    res.json({ received: true })
  }
)

export default router
