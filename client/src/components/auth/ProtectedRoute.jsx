import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

export default function ProtectedRoute({ children }) {
  const { session, profile, profileError, loading, switching, fetchProfile } = useAuthStore()
  const retried = useRef(false)

  useEffect(() => {
    if (session && !profile && profileError && !retried.current) {
      retried.current = true
      fetchProfile()
    }
  }, [session, profile, profileError, fetchProfile])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (switching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Profile failed to load after retry — redirect to login
  if (profileError && retried.current) {
    return <Navigate to="/login" replace />
  }

  // Wait for profile to load before checking payment status
  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile.is_paid) {
    return <Navigate to="/payment" replace />
  }

  return children
}
