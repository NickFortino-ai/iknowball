import { Router } from 'express'
import Stripe from 'stripe'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'
import { verifyTransaction } from '../services/appleIapService.js'

const router = Router()
const stripe = new Stripe(env.STRIPE_SECRET_KEY)

const PRICE_IDS = {
  monthly: env.STRIPE_MONTHLY_PRICE_ID || 'price_1TIMIVCdrW8CXAu2Tvfepw5t',
  yearly: env.STRIPE_YEARLY_PRICE_ID || 'price_1TIMMxCdrW8CXAu2z4smZ8fD',
}

router.use(requireAuth)

// Create Stripe Checkout session for subscription
router.post('/create-checkout-session', async (req, res) => {
  const { plan } = req.body // 'monthly' or 'yearly'
  const priceId = PRICE_IDS[plan] || PRICE_IDS.monthly
  const origin = env.CORS_ORIGIN.split(',')[0].trim()

  // Get or create Stripe customer
  let customerId = null
  const { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id, username')
    .eq('id', req.user.id)
    .single()

  if (user?.stripe_customer_id) {
    customerId = user.stripe_customer_id
  } else {
    const customer = await stripe.customers.create({
      metadata: { user_id: req.user.id, username: user?.username || '' },
    })
    customerId = customer.id
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', req.user.id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: req.user.id, plan: plan || 'monthly' },
    subscription_data: {
      metadata: { user_id: req.user.id },
    },
    success_url: `${origin}/payment?status=success`,
    cancel_url: `${origin}/payment?status=cancelled`,
  })

  res.json({ url: session.url })
})

// Create Stripe billing portal session (manage subscription)
router.post('/create-portal-session', async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', req.user.id)
    .single()

  if (!user?.stripe_customer_id) {
    return res.status(400).json({ error: 'No subscription found' })
  }

  const origin = env.CORS_ORIGIN.split(',')[0].trim()
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/settings`,
  })

  res.json({ url: portalSession.url })
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

  // Determine if this is a lifetime promo or trial promo
  const isLifetime = promo.type === 'lifetime' || !promo.type

  if (isLifetime) {
    // Lifetime promo: grant access immediately, no payment needed
    const { error: userError } = await supabase
      .from('users')
      .update({
        is_paid: true,
        promo_code_used: promo.code,
        payment_source: 'promo',
        is_lifetime: true,
        subscription_status: 'lifetime',
      })
      .eq('id', req.user.id)

    if (userError) {
      logger.error({ error: userError, userId: req.user.id }, 'Failed to update user after promo redemption')
      return res.status(500).json({ error: 'Failed to apply promo code' })
    }

    logger.info({ userId: req.user.id, code: promo.code }, 'Lifetime promo code redeemed')
    return res.json({ success: true, type: 'lifetime' })
  }

  // Trial promo: redirect to Stripe with free trial period
  // User provides payment info upfront, auto-billed after trial ends
  const trialDays = promo.trial_days || 180
  const origin = env.CORS_ORIGIN.split(',')[0].trim()

  // Save promo code on user before checkout
  await supabase
    .from('users')
    .update({ promo_code_used: promo.code })
    .eq('id', req.user.id)

  // Get or create Stripe customer
  const { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id, username')
    .eq('id', req.user.id)
    .single()

  let customerId = user?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { user_id: req.user.id, username: user?.username || '' },
    })
    customerId = customer.id
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', req.user.id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: PRICE_IDS.monthly, quantity: 1 }],
    metadata: { user_id: req.user.id, plan: 'monthly', promo_code: promo.code },
    subscription_data: {
      trial_period_days: trialDays,
      metadata: { user_id: req.user.id, promo_code: promo.code },
    },
    success_url: `${origin}/payment?status=success`,
    cancel_url: `${origin}/payment?status=cancelled`,
  })

  logger.info({ userId: req.user.id, code: promo.code, trialDays }, 'Trial promo → Stripe checkout with trial')
  res.json({ success: true, type: 'trial', trialDays, checkoutUrl: session.url })
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

    // Determine subscription period from product ID
    const productId = decoded.productId || ''
    const isYearly = productId.includes('yearly') || productId.includes('annual')
    const periodDays = isYearly ? 365 : 30

    // Mark user as subscribed
    const { error } = await supabase
      .from('users')
      .update({
        is_paid: true,
        apple_original_transaction_id: txId,
        payment_source: 'apple',
        subscription_status: 'active',
        subscription_plan: isYearly ? 'yearly' : 'monthly',
        subscription_expires_at: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', req.user.id)

    if (error) {
      logger.error({ error, userId: req.user.id }, 'Failed to update user after Apple IAP')
      return res.status(500).json({ error: 'Database update failed' })
    }

    logger.info({ userId: req.user.id, txId, productId: decoded.productId }, 'User subscribed via Apple IAP')
    res.json({ success: true })
  } catch (err) {
    logger.error({ err, userId: req.user.id }, 'Apple IAP verification failed')
    return res.status(400).json({ error: 'Transaction verification failed' })
  }
})

// Check payment/subscription status
router.get('/status', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('is_paid, is_lifetime, subscription_status, subscription_expires_at, subscription_plan, stripe_customer_id')
    .eq('id', req.user.id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'User not found' })
  }

  const hasAccess = data.is_lifetime ||
    data.subscription_status === 'active' ||
    (data.subscription_expires_at && new Date(data.subscription_expires_at) > new Date())

  res.json({
    is_paid: hasAccess,
    is_lifetime: data.is_lifetime,
    subscription_status: data.subscription_status,
    subscription_plan: data.subscription_plan,
    subscription_expires_at: data.subscription_expires_at,
    has_stripe: !!data.stripe_customer_id,
  })
})

export default router
