import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'

const tiers = [
  { name: 'Lost', color: 'border-tier-lost text-tier-lost' },
  { name: 'Rookie', color: 'border-tier-rookie text-tier-rookie' },
  { name: 'Baller', color: 'border-tier-baller text-tier-baller' },
  { name: 'Elite', color: 'border-tier-elite text-tier-elite' },
  { name: 'Hall of Famer', color: 'border-tier-hof text-tier-hof' },
  { name: 'GOAT', color: 'border-tier-goat text-tier-goat' },
]

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
  const pollCount = useRef(0)

  const status = searchParams.get('status')

  // Redirect if already paid
  useEffect(() => {
    if (profile?.is_paid) {
      navigate('/picks', { replace: true })
    }
  }, [profile, navigate])

  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      navigate('/login', { replace: true })
    }
  }, [session, navigate])

  // Poll after successful checkout redirect
  useEffect(() => {
    if (status !== 'success' || polling) return
    setPolling(true)
    pollCount.current = 0

    const interval = setInterval(async () => {
      pollCount.current += 1
      try {
        const { is_paid } = await api.get('/payments/status')
        if (is_paid) {
          clearInterval(interval)
          await fetchProfile()
          navigate('/picks', { replace: true })
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

  const handleCheckout = async () => {
    setLoading(true)
    setError(null)
    try {
      const { url } = await api.post('/payments/create-checkout-session')
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
      await api.post('/payments/redeem-promo', { code: promoCode })
      await fetchProfile()
      navigate('/picks', { replace: true })
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
          <p className="text-text-secondary">Processing payment...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-bg-card rounded-2xl p-8 border border-border">
        <h1 className="font-display text-3xl text-center mb-2">Unlock I Know Ball</h1>
        <p className="text-text-secondary text-center mb-8">
          One-time payment to access all features
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

        {/* Tier breakdown */}
        <div className="flex gap-1.5 mb-8 justify-center">
          {tiers.map((tier) => (
            <div key={tier.name} className={`rounded-lg border ${tier.color} px-2 py-1.5 text-center text-xs`}>
              <div className="font-display">{tier.name}</div>
            </div>
          ))}
        </div>

        {/* Checkout button */}
        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 text-lg mb-4"
        >
          {loading ? 'Redirecting...' : 'Unlock I Know Ball — $1'}
        </button>

        {/* Promo code section */}
        {!showPromo ? (
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
        )}
      </div>
    </div>
  )
}
