import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-bg-card rounded-2xl p-8 border border-border">
        <h1 className="font-display text-3xl text-center mb-2">Reset Password</h1>
        <p className="text-text-secondary text-center mb-8">
          Enter your email and we'll send you a reset link
        </p>

        {error && (
          <div className="bg-incorrect-muted border border-incorrect rounded-lg p-3 mb-6 text-sm text-incorrect">
            {error}
          </div>
        )}

        {sent ? (
          <div className="bg-correct-muted border border-correct rounded-lg p-4 text-sm text-correct text-center">
            Check your email for a password reset link. It may take a minute to arrive.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="text-center text-text-secondary mt-6 text-sm">
          <Link to="/login" className="text-accent hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
