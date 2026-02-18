import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    fetch(`${API_BASE}/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.ok) setStatus('success')
        else setStatus('error')
      })
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      {status === 'loading' && (
        <p className="text-text-muted">Unsubscribing...</p>
      )}
      {status === 'success' && (
        <>
          <h1 className="font-display text-2xl mb-3">Unsubscribed</h1>
          <p className="text-text-muted">You've been removed from IKnowBall emails. You won't receive any more.</p>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className="font-display text-2xl mb-3">Something went wrong</h1>
          <p className="text-text-muted">This unsubscribe link may be invalid or expired.</p>
        </>
      )}
    </div>
  )
}
