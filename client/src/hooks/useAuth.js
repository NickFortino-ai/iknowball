import { useAuthStore } from '../stores/authStore'

export function useAuth() {
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const loading = useAuthStore((s) => s.loading)
  const signOut = useAuthStore((s) => s.signOut)

  return {
    session,
    profile,
    loading,
    signOut,
    isAuthenticated: !!session,
  }
}
