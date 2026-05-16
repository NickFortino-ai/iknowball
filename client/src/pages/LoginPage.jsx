import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import PasswordInput from '../components/ui/PasswordInput'

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const signIn = useAuthStore((s) => s.signIn)
  const navigate = useNavigate()
  const ctx = useOutletContext() || {}
  const { leaguePreview } = ctx

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(identifier, password)
      const pendingCode = localStorage.getItem('pendingInviteCode')
      if (pendingCode) { navigate(`/join/${pendingCode}`); return }
      // Card-on-landing flow: user tapped a format card while logged out,
      // signed in instead of signing up — drop them on /leagues/create.
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
        navigate(`/leagues/create?${params.toString()}`)
        return
      }
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-bg-primary/40 backdrop-blur-md rounded-2xl p-6 sm:p-7 border border-white/15">
        <div className="flex justify-center mb-5">
          <div className="inline-flex items-center px-4 py-1.5 bg-accent/15 border-2 border-accent rounded-lg">
            <span className="font-display text-xs sm:text-sm text-accent tracking-[0.35em]">
              I KNOW BALL
            </span>
          </div>
        </div>

        {leaguePreview && (
          <p className="text-white/85 text-center text-sm mb-4">
            Sign in to join <span className="font-semibold">{leaguePreview.name}</span>.
          </p>
        )}

        {error && (
          <div className="bg-incorrect/15 border border-incorrect rounded-lg p-3 mb-4 text-sm text-incorrect">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-white/80 mb-1">Username or Email</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="w-full bg-bg-input/80 border border-white/20 rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder="username or email"
            />
          </div>
          <div>
            <label className="block text-sm text-white/80 mb-1">Password</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-accent hover:underline text-sm">
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-white/80 mt-5 text-sm">
          Don't have an account?{' '}
          <Link to="/signup" className="text-accent hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  )
}
