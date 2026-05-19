import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import PasswordInput from '../components/ui/PasswordInput'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const signUp = useAuthStore((s) => s.signUp)
  const navigate = useNavigate()
  // Optional context from HeroLayout — present when this page is rendered
  // under the layout. Falls back to safe defaults if a future caller mounts
  // it standalone.
  const ctx = useOutletContext() || {}
  const { leaguePreview } = ctx

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signUp(email, password, username)
      const pendingCode = localStorage.getItem('pendingInviteCode')
      navigate(pendingCode ? `/join/${pendingCode}` : '/payment')
    } catch (err) {
      if (err.message?.toLowerCase().includes('already registered') || err.message?.toLowerCase().includes('already exists')) {
        setError('There is already an account associated with this email. For help, send an email to admin@iknowball.club')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-bg-primary/40 backdrop-blur-md rounded-2xl p-6 sm:p-7 border border-white/15">
        {leaguePreview && (
          <p className="text-white/85 text-center text-sm mb-4">
            Create your account to join this league.
          </p>
        )}

        {error && (
          <div className="bg-incorrect/15 border border-incorrect rounded-lg p-3 mb-4 text-sm text-incorrect">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-white/80 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              pattern="^[a-zA-Z0-9_]+$"
              onInvalid={(e) => {
                const v = e.target.validity
                if (v.patternMismatch) {
                  e.target.setCustomValidity(
                    e.target.value.includes(' ')
                      ? 'Please remove the spaces from your username.'
                      : 'Username can only contain letters, numbers, and underscores.'
                  )
                } else if (v.tooShort) {
                  e.target.setCustomValidity('Username must be at least 3 characters.')
                } else if (v.valueMissing) {
                  e.target.setCustomValidity('Please choose a username.')
                } else {
                  e.target.setCustomValidity('')
                }
              }}
              onInput={(e) => e.target.setCustomValidity('')}
              className="w-full bg-bg-input/80 border border-white/20 rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder="ballknower42"
            />
          </div>
          <div>
            <label className="block text-sm text-white/80 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-bg-input/80 border border-white/20 rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder="you@example.com"
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
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-white/80 mt-5 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline">Sign in</Link>
        </p>
        <p className="text-center text-white/60 mt-3 text-xs">
          By signing up, you agree to our{' '}
          <Link to="/guidelines" className="text-accent hover:underline">Community Guidelines</Link>
        </p>
      </div>
    </div>
  )
}
