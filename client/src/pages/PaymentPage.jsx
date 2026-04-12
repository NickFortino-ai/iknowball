import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import {
  isIAPAvailable,
  getSeasonAccessProduct,
  purchaseSeasonAccess,
  restoreSeasonAccess,
  savePendingTransaction,
  getPendingTransaction,
  clearPendingTransaction,
} from '../lib/iap'


async function attemptPendingJoin() {
  const code = localStorage.getItem('pendingInviteCode')
  if (!code) return null
  try {
    const league = await api.post('/leagues/_/join', { invite_code: code })
    localStorage.removeItem('pendingInviteCode')
    return league
  } catch {
    return null
  }
}

function isNewUser(profile) {
  return profile && !profile.bio && !profile.avatar_emoji
}

async function navigateAfterPayment(fetchProfile, navigate) {
  const league = await attemptPendingJoin()
  if (league) {
    localStorage.setItem('onboardingReturnPath', `/leagues/${league.id}`)
    navigate(`/leagues/${league.id}`, { replace: true })
    await fetchProfile()
    return
  }
  const pendingCode = localStorage.getItem('pendingInviteCode')
  if (pendingCode) {
    localStorage.setItem('onboardingReturnPath', `/join/${pendingCode}`)
    navigate(`/join/${pendingCode}`, { replace: true })
    await fetchProfile()
    return
  }
  await fetchProfile()
  const updatedProfile = useAuthStore.getState().profile
  navigate(isNewUser(updatedProfile) ? '/' : '/picks', { replace: true })
}

export default function PaymentPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { session, profile, fetchProfile } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPromo, setShowPromo] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [polling, setPolling] = useState(false)
  const [product, setProduct] = useState(null)
  const [restoringPurchase, setRestoringPurchase] = useState(false)
  const [plan, setPlan] = useState('yearly') // default to yearly (better value)
  const pollCount = useRef(0)
  const pendingRecoveryAttempted = useRef(false)

  const isNative = isIAPAvailable()
  const status = searchParams.get('status')

  // Redirect if already paid/subscribed
  useEffect(() => {
    if (profile?.is_paid || profile?.is_lifetime) {
      attemptPendingJoin().then((league) => {
        if (league) {
          navigate(`/leagues/${league.id}`, { replace: true })
          return
        }
        const pendingCode = localStorage.getItem('pendingInviteCode')
        if (pendingCode) {
          navigate(`/join/${pendingCode}`, { replace: true })
          return
        }
        navigate(isNewUser(profile) ? '/' : '/picks', { replace: true })
      })
    }
  }, [profile, navigate])

  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      navigate('/login', { replace: true })
    }
  }, [session, navigate])

  // Native: fetch product details and recover pending transactions
  useEffect(() => {
    if (!isNative) return

    getSeasonAccessProduct().then(setProduct)

    if (!pendingRecoveryAttempted.current) {
      pendingRecoveryAttempted.current = true
      const pendingJws = getPendingTransaction()
      if (pendingJws) {
        setLoading(true)
        api.post('/payments/verify-apple-iap', { signedTransaction: pendingJws })
          .then(() => {
            clearPendingTransaction()
            return navigateAfterPayment(fetchProfile, navigate)
          })
          .catch(() => {
            clearPendingTransaction()
            setLoading(false)
          })
      }
    }
  }, [isNative, fetchProfile, navigate])

  // Poll after successful Stripe checkout redirect
  useEffect(() => {
    if (status !== 'success' || polling) return
    setPolling(true)
    pollCount.current = 0

    const interval = setInterval(async () => {
      pollCount.current += 1
      try {
        const data = await api.get('/payments/status')
        if (data.is_paid) {
          clearInterval(interval)
          await navigateAfterPayment(fetchProfile, navigate)
        }
      } catch {
        // ignore polling errors
      }
      if (pollCount.current >= 10) {
        clearInterval(interval)
        setPolling(false)
        setError('Payment is taking longer than expected. Please refresh the page.')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [status, polling, fetchProfile, navigate])

  // Native Apple IAP purchase
  const handleApplePurchase = async () => {
    setLoading(true)
    setError(null)
    try {
      const transaction = await purchaseSeasonAccess()
      if (!transaction?.jwsRepresentation) {
        throw new Error('No transaction returned')
      }

      savePendingTransaction(transaction.jwsRepresentation)

      await api.post('/payments/verify-apple-iap', {
        signedTransaction: transaction.jwsRepresentation,
      })

      clearPendingTransaction()
      await navigateAfterPayment(fetchProfile, navigate)
    } catch (err) {
      const msg = (err.message || '').toLowerCase()
      if (msg.includes('cancel') || msg.includes('user cancelled')) {
        setLoading(false)
        return
      }
      setError(err.message || 'Purchase failed. Please try again.')
      setLoading(false)
    }
  }

  // Restore purchases (native only)
  const handleRestore = async () => {
    setRestoringPurchase(true)
    setError(null)
    try {
      const transaction = await restoreSeasonAccess()
      if (!transaction?.jwsRepresentation) {
        setError('No previous purchase found.')
        return
      }

      await api.post('/payments/verify-apple-iap', {
        signedTransaction: transaction.jwsRepresentation,
      })

      await navigateAfterPayment(fetchProfile, navigate)
    } catch (err) {
      setError(err.message || 'Restore failed. Please try again.')
    } finally {
      setRestoringPurchase(false)
    }
  }

  // Stripe web checkout
  const handleCheckout = async () => {
    setLoading(true)
    setError(null)
    try {
      const { url } = await api.post('/payments/create-checkout-session', { plan })
      window.location.href = url
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handlePromo = async (e) => {
    e.preventDefault()
    setPromoLoading(true)
    setError(null)
    try {
      const result = await api.post('/payments/redeem-promo', { code: promoCode })
      if (result.type === 'trial' && result.checkoutUrl) {
        // Trial promo → redirect to Stripe to collect payment info
        window.location.href = result.checkoutUrl
      } else {
        // Lifetime promo → access granted immediately
        await navigateAfterPayment(fetchProfile, navigate)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setPromoLoading(false)
    }
  }

  // Show spinner while polling after checkout
  if (status === 'success' && polling) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">Activating your subscription...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-bg-card rounded-2xl p-8 border border-border">
        <h1 className="font-display text-3xl text-center mb-2">I KNOW BALL</h1>
        <p className="text-text-secondary text-center mb-6">
          Subscribe to compete, climb the leaderboard, and prove you know ball.
        </p>

        {(error || status === 'cancelled') && (
          <div className="bg-incorrect-muted border border-incorrect rounded-lg p-3 mb-6 text-sm text-incorrect">
            {error || 'Payment was cancelled. Try again when you\'re ready.'}
          </div>
        )}

        {/* Scoring examples */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="bg-bg-primary rounded-xl border border-border p-3 text-center">
            <div className="font-display text-xl text-correct">+20</div>
            <div className="text-text-muted text-xs">Underdog win</div>
          </div>
          <div className="bg-bg-primary rounded-xl border border-border p-3 text-center">
            <div className="font-display text-xl text-accent">+4</div>
            <div className="text-text-muted text-xs">Favorite win</div>
          </div>
          <div className="bg-bg-primary rounded-xl border border-border p-3 text-center">
            <div className="font-display text-xl text-incorrect">-10</div>
            <div className="text-text-muted text-xs">Wrong pick</div>
          </div>
        </div>

        {/* Plan toggle — web only */}
        {!isNative && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setPlan('monthly')}
              className={`flex-1 py-3 rounded-xl text-center transition-all ${
                plan === 'monthly'
                  ? 'bg-accent/10 border-2 border-accent'
                  : 'bg-bg-primary border border-border hover:border-text-primary/30'
              }`}
            >
              <div className="font-display text-lg text-text-primary">$1</div>
              <div className="text-xs text-text-muted">per month</div>
            </button>
            <button
              onClick={() => setPlan('yearly')}
              className={`flex-1 py-3 rounded-xl text-center transition-all relative ${
                plan === 'yearly'
                  ? 'bg-accent/10 border-2 border-accent'
                  : 'bg-bg-primary border border-border hover:border-text-primary/30'
              }`}
            >
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-correct text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                Save 17%
              </div>
              <div className="font-display text-lg text-text-primary">$10</div>
              <div className="text-xs text-text-muted">per year</div>
            </button>
          </div>
        )}

        {/* Purchase button */}
        <button
          onClick={isNative ? handleApplePurchase : handleCheckout}
          disabled={loading || (isNative && !product)}
          className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 text-lg mb-3"
        >
          {loading ? 'Processing...' : isNative
            ? product ? `Subscribe — ${product.priceString}` : 'Purchase unavailable'
            : `Subscribe — ${plan === 'yearly' ? '$10/year' : '$1/month'}`
          }
        </button>

        {/* Auto-renewal disclosure */}
        <p className="text-[10px] text-text-muted text-center mb-4 leading-relaxed">
          {isNative
            ? 'Subscription auto-renews unless cancelled at least 24 hours before the end of the current period. Manage in Settings > Apple ID > Subscriptions.'
            : `Your subscription will auto-renew at ${plan === 'yearly' ? '$10.00/year' : '$1.00/month'} until cancelled. You can manage or cancel anytime from your account settings.`
          }
        </p>

        {/* Restore Purchases — native only */}
        {isNative && (
          <button
            onClick={handleRestore}
            disabled={restoringPurchase}
            className="w-full text-text-secondary hover:text-text-primary text-sm transition-colors mb-2"
          >
            {restoringPurchase ? 'Restoring...' : 'Restore Purchase'}
          </button>
        )}

        {/* Promo code section — hidden on native iOS app */}
        {!Capacitor.isNativePlatform() && (
          !showPromo ? (
            <button
              onClick={() => setShowPromo(true)}
              className="w-full text-text-secondary hover:text-text-primary text-sm transition-colors"
            >
              Have a promo code?
            </button>
          ) : (
            <form onSubmit={handlePromo} className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Enter code"
                required
                className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
              <button
                type="submit"
                disabled={promoLoading}
                className="border border-accent text-accent hover:bg-accent hover:text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {promoLoading ? 'Applying...' : 'Apply'}
              </button>
            </form>
          )
        )}

        {/* Why we charge */}
        <div className="mt-6 pt-5 border-t border-text-primary/10">
          <p className="text-xs text-text-muted leading-relaxed">
            <span className="text-text-secondary font-semibold">Why do we charge?</span> If you're not paying for the product, you are the product. IKB runs zero ads and shares nothing about you with anyone. It costs real money to run live odds, real-time scoring, and fantasy leagues — so instead of selling your data, we charge a dollar a month. The people behind IKB are devoted to one thing: building the best fantasy and sports prediction app ever made.
          </p>
        </div>
      </div>
    </div>
  )
}
