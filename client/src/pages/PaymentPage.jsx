import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import { openExternalUrl } from '../lib/openExternalUrl'
import {
  isIAPAvailable,
  getSubscriptionProducts,
  purchaseSubscription,
  restoreSubscription,
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
  // Card-on-landing flow: user tapped a format card pre-signup, we stashed
  // their intent; drop them straight on /leagues/create with the format
  // (and optional sport) pre-selected.
  const pendingCreate = (() => {
    try {
      const raw = localStorage.getItem('pendingCreateFormat')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })()
  if (pendingCreate?.format) {
    try { localStorage.removeItem('pendingCreateFormat') } catch {}
    const params = new URLSearchParams({ format: pendingCreate.format })
    if (pendingCreate.sport) params.set('sport', pendingCreate.sport)
    const target = `/leagues/create?${params.toString()}`
    localStorage.setItem('onboardingReturnPath', target)
    navigate(target, { replace: true })
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
  const [products, setProducts] = useState({ monthly: null, yearly: null })
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

    getSubscriptionProducts().then(setProducts)

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
            // Keep the JWS for another retry — clearing on failure is what
            // permanently lost purchases during the appAppleId-missing bug.
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

  // Native IAP purchase — routes through Apple (iOS) or Google Play (Android)
  // based on platform. @capgo/native-purchases handles the platform-specific
  // store interaction client-side; server verify endpoint differs by store.
  const handleNativePurchase = async () => {
    setLoading(true)
    setError(null)
    try {
      const transaction = await purchaseSubscription(plan)
      if (!transaction) {
        throw new Error('No transaction returned')
      }

      const isAndroid = Capacitor.getPlatform() === 'android'

      if (isAndroid) {
        // Android: transactionId is the Play Billing purchase token.
        // productIdentifier comes back on the transaction record.
        const purchaseToken = transaction.transactionId
        const productId = transaction.productIdentifier
        if (!purchaseToken || !productId) {
          throw new Error('Missing purchaseToken or productId on Android transaction')
        }
        await api.post('/payments/verify-google-iap', { purchaseToken, productId })
      } else {
        // iOS: jwsRepresentation is the JWS-signed transaction Apple
        // returns. savePendingTransaction stashes it so a retry after
        // app reload can re-verify if the initial POST fails.
        if (!transaction.jwsRepresentation) {
          throw new Error('No jwsRepresentation on iOS transaction')
        }
        savePendingTransaction(transaction.jwsRepresentation)
        await api.post('/payments/verify-apple-iap', {
          signedTransaction: transaction.jwsRepresentation,
        })
        clearPendingTransaction()
      }

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

  // Restore purchases (native only) — Apple or Google depending on platform
  const handleRestore = async () => {
    setRestoringPurchase(true)
    setError(null)
    try {
      const transaction = await restoreSubscription()
      if (!transaction) {
        setError('No previous purchase found.')
        return
      }

      const isAndroid = Capacitor.getPlatform() === 'android'

      if (isAndroid) {
        const purchaseToken = transaction.transactionId
        const productId = transaction.productIdentifier
        if (!purchaseToken || !productId) {
          setError('No previous purchase found.')
          return
        }
        await api.post('/payments/verify-google-iap', { purchaseToken, productId })
      } else {
        if (!transaction.jwsRepresentation) {
          setError('No previous purchase found.')
          return
        }
        await api.post('/payments/verify-apple-iap', {
          signedTransaction: transaction.jwsRepresentation,
        })
      }

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

  // Pull invite-flow league context if HeroLayout supplied it (window stash
  // avoids requiring useOutletContext when this page is mounted standalone)
  const inviteLeague = (typeof window !== 'undefined' && window.__ikb_invite_league) || null

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-bg-primary/40 backdrop-blur-md rounded-2xl p-6 sm:p-7 border border-white/15">
        {(error || status === 'cancelled') && (
          <div className="bg-incorrect/15 border border-incorrect rounded-lg p-3 mb-4 text-sm text-incorrect">
            {error || 'Payment was cancelled. Try again when you\'re ready.'}
          </div>
        )}

        {/* What you get */}
        <div className="bg-bg-primary/40 backdrop-blur-sm border border-white/15 rounded-xl p-4 mb-5">
          <div className="font-display text-sm text-accent uppercase tracking-wider mb-3">What you get for under $1 per month</div>
          <ul className="space-y-2 text-sm text-white">
            <li className="flex gap-2.5">
              <span className="text-accent shrink-0 mt-0.5">●</span>
              <span>The best fantasy and sports prediction app in the game.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent shrink-0 mt-0.5">●</span>
              <span>Connection to a competitive community of sports fans.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent shrink-0 mt-0.5">●</span>
              <span>An array of odds-based picks daily — test your prediction powers.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent shrink-0 mt-0.5">●</span>
              <span>18 league formats — create or join Fantasy Football leagues, Salary Cap DFS, Survivor, Brackets, Squares, and much more.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent shrink-0 mt-0.5">●</span>
              <span>Your whole pick history tracked forever — every win, streak, and tier climb stays with you.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent shrink-0 mt-0.5">●</span>
              <span>A sports-centric social hub — post images, videos, or text, connect with other users, link all your socials to get followed everywhere.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent shrink-0 mt-0.5">●</span>
              <span>Zero ads, zero data sales.</span>
            </li>
          </ul>
        </div>

        {/* Plan toggle */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setPlan('monthly')}
            className={`flex-1 py-3 rounded-xl text-center transition-all ${
              plan === 'monthly'
                ? 'bg-accent/15 border-2 border-accent'
                : 'bg-bg-primary/40 backdrop-blur-sm border border-white/15 hover:border-white/30'
            }`}
          >
            <div className="font-display text-lg text-white">
              {isNative ? products.monthly?.priceString || '$0.99' : '$0.99'}
            </div>
            <div className="text-xs text-white/70">per month</div>
          </button>
          <button
            onClick={() => setPlan('yearly')}
            className={`flex-1 py-3 rounded-xl text-center transition-all relative ${
              plan === 'yearly'
                ? 'bg-accent/15 border-2 border-accent'
                : 'bg-bg-primary/40 backdrop-blur-sm border border-white/15 hover:border-white/30'
            }`}
          >
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-correct text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              Save 17%
            </div>
            <div className="font-display text-lg text-white">
              {isNative ? products.yearly?.priceString || '$9.99' : '$9.99'}
            </div>
            <div className="text-xs text-white/70">per year</div>
          </button>
        </div>

        {/* Purchase button */}
        <button
          onClick={isNative ? handleNativePurchase : handleCheckout}
          disabled={loading || (isNative && !products[plan])}
          className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 text-lg mb-3"
        >
          {loading ? 'Processing...' : isNative
            ? products[plan] ? `Subscribe — ${products[plan].priceString}` : 'Purchase unavailable'
            : `Subscribe — ${plan === 'yearly' ? '$9.99/year' : '$0.99/month'}`
          }
        </button>

        {/* Auto-renewal disclosure */}
        <p className="text-[10px] text-white/65 text-center mb-2 leading-relaxed">
          {isNative
            ? 'Subscription auto-renews unless cancelled at least 24 hours before the end of the current period. Manage in Settings > Apple ID > Subscriptions.'
            : 'Your subscription will auto-renew until cancelled. You can manage or cancel anytime from your account settings.'
          }
        </p>

        {/* Terms + Privacy links (required by Apple guideline 3.1.2 for
            auto-renewing subscriptions). Open via SFSafariViewController
            on native — plain <a target="_blank"> doesn't reliably open
            outside the webview on iOS Capacitor builds, which is what
            tripped the June 6 App Review rejection. */}
        <p className="text-xs text-white/80 text-center mb-4 leading-relaxed">
          By subscribing you agree to our{' '}
          <button
            type="button"
            onClick={() => openExternalUrl('https://iknowball.club/terms')}
            className="text-accent underline font-semibold"
          >
            Terms of Use
          </button>
          {' '}and{' '}
          <button
            type="button"
            onClick={() => openExternalUrl('https://iknowball.club/privacy')}
            className="text-accent underline font-semibold"
          >
            Privacy Policy
          </button>.
        </p>

        {/* Restore Purchases — native only */}
        {isNative && (
          <button
            onClick={handleRestore}
            disabled={restoringPurchase}
            className="w-full text-white/85 hover:text-white text-sm transition-colors mb-2"
          >
            {restoringPurchase ? 'Restoring...' : 'Restore Purchase'}
          </button>
        )}

        {/* Promo code section — hidden on native iOS app */}
        {!Capacitor.isNativePlatform() && (
          !showPromo ? (
            <button
              onClick={() => setShowPromo(true)}
              className="w-full border-2 border-accent text-accent hover:bg-accent/10 font-display tracking-wide py-2.5 rounded-lg text-sm sm:text-base transition-colors"
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
                className="flex-1 bg-bg-input/80 border border-white/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
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
        <div className="mt-6 pt-5 border-t border-text-primary/15">
          <p className="text-xs text-text-primary/85 leading-relaxed">
            <span className="text-text-primary font-display text-sm">Why we charge.</span> If you're not paying for the product, you are the product. IKB runs zero ads and shares nothing about you with anyone. We charge a dollar a month so we can build the best fantasy and sports prediction app ever made — without selling your data to do it.
          </p>
        </div>
      </div>
    </div>
  )
}
