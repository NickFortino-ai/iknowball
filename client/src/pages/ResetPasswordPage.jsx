import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [tokenError, setTokenError] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (!accessToken || !refreshToken || type !== 'recovery') {
      setTokenError(true)
      return
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setTokenError(true)
        } else {
          setSessionReady(true)
          window.history.replaceState(null, '', window.location.pathname)
        }
      })
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-bg-card rounded-2xl p-8 border border-border text-center">
          <h1 className="font-display text-3xl mb-4">Invalid or Expired Link</h1>
          <p className="text-text-secondary mb-6">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link
            to="/forgot-password"
            className="inline-block bg-accent hover:bg-accent-hover text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Request New Link
          </Link>
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-text-secondary">Verifying reset link...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-bg-card rounded-2xl p-8 border border-border">
        <h1 className="font-display text-3xl text-center mb-2">Set New Password</h1>
        <p className="text-text-secondary text-center mb-8">
          Enter your new password below
        </p>

        {error && (
          <div className="bg-incorrect-muted border border-incorrect rounded-lg p-3 mb-6 text-sm text-incorrect">
            {error}
          </div>
        )}

        {success ? (
          <div className="bg-correct-muted border border-correct rounded-lg p-4 text-sm text-correct text-center">
            Password updated! Redirecting to login...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
