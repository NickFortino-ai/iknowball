import { Router } from 'express'
import Stripe from 'stripe'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'
import { verifyTransaction } from '../services/appleIapService.js'

const router = Router()
const stripe = new Stripe(env.STRIPE_SECRET_KEY)

router.use(requireAuth)

// Create Stripe Checkout session
router.post('/create-checkout-session', async (req, res) => {
  const origin = env.CORS_ORIGIN.split(',')[0].trim()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'I Know Ball — Season Access' },
          unit_amount: 100,
        },
        quantity: 1,
      },
    ],
    metadata: { user_id: req.user.id },
    success_url: `${origin}/payment?status=success`,
    cancel_url: `${origin}/payment?status=cancelled`,
  })

  res.json({ url: session.url })
})

// Redeem a promo code
router.post('/redeem-promo', async (req, res) => {
  const { code } = req.body
  if (!code) {
    return res.status(400).json({ error: 'Promo code is required' })
  }

  const { data: promo, error: lookupError } = await supabase
    .from('promo_codes')
    .select('*')
    .ilike('code', code)
    .eq('is_active', true)
    .single()

  if (lookupError || !promo) {
    return res.status(404).json({ error: 'Invalid or expired promo code' })
  }

  // Race-safe increment: only update if current_uses < max_uses
  const { data: updated, error: incrementError } = await supabase
    .from('promo_codes')
    .update({ current_uses: promo.current_uses + 1 })
    .eq('id', promo.id)
    .lt('current_uses', promo.max_uses)
    .select()
    .single()

  if (incrementError || !updated) {
    return res.status(410).json({ error: 'Promo code has reached its usage limit' })
  }

  const { error: userError } = await supabase
    .from('users')
    .update({ is_paid: true, promo_code_used: promo.code, payment_source: 'promo' })
    .eq('id', req.user.id)

  if (userError) {
    logger.error({ error: userError, userId: req.user.id }, 'Failed to update user after promo redemption')
    return res.status(500).json({ error: 'Failed to apply promo code' })
  }

  logger.info({ userId: req.user.id, code: promo.code }, 'Promo code redeemed')
  res.json({ success: true })
})

// Verify Apple IAP transaction
router.post('/verify-apple-iap', async (req, res) => {
  const { signedTransaction } = req.body
  if (!signedTransaction) {
    return res.status(400).json({ error: 'signedTransaction is required' })
  }

  try {
    const decoded = await verifyTransaction(signedTransaction)
    const txId = decoded.originalTransactionId

    // Idempotency: check if this transaction was already processed
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('apple_original_transaction_id', txId)
      .maybeSingle()

    if (existing) {
      logger.info({ userId: existing.id, txId }, 'Apple IAP already processed')
      return res.json({ success: true })
    }

    // Mark user as paid
    const { error } = await supabase
      .from('users')
      .update({
        is_paid: true,
        apple_original_transaction_id: txId,
        payment_source: 'apple',
      })
      .eq('id', req.user.id)

    if (error) {
      logger.error({ error, userId: req.user.id }, 'Failed to update user after Apple IAP')
      return res.status(500).json({ error: 'Database update failed' })
    }

    logger.info({ userId: req.user.id, txId, productId: decoded.productId }, 'User marked as paid via Apple IAP')
    res.json({ success: true })
  } catch (err) {
    logger.error({ err, userId: req.user.id }, 'Apple IAP verification failed')
    return res.status(400).json({ error: 'Transaction verification failed' })
  }
})

// Check payment status
router.get('/status', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('is_paid')
    .eq('id', req.user.id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'User not found' })
  }

  res.json({ is_paid: data.is_paid })
})

export default router
