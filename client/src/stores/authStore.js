import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { getSavedAccounts, upsertAccount, removeAccount } from '../lib/accountManager'

export const useAuthStore = create((set, get) => ({
  session: null,
  profile: null,
  profileError: false,
  loading: true,
  switching: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, loading: false })

    if (session) {
      get().fetchProfile()
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session })
      if (session) {
        get().fetchProfile().then(() => {
          const profile = get().profile
          if (profile) {
            upsertAccount({
              userId: session.user.id,
              username: profile.username,
              displayName: profile.display_name || profile.username,
              avatarEmoji: profile.avatar_emoji || null,
              refreshToken: session.refresh_token,
            })
          }
        })
      } else {
        set({ profile: null })
      }
    })
  },

  fetchProfile: async () => {
    try {
      set({ profileError: false })
      const profile = await api.get('/users/me')
      set({ profile })
    } catch {
      set({ profile: null, profileError: true })
    }
  },

  signUp: async (email, password, username) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error

    await api.post('/users/register', { username })
    await get().fetchProfile()
    return data
  },

  signIn: async (identifier, password) => {
    let email = identifier
    // If no @ sign, treat as username and resolve to email
    if (!identifier.includes('@')) {
      const resolved = await api.post('/users/resolve', { username: identifier })
      email = resolved.email
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  signOut: async () => {
    const { session } = get()
    if (session) {
      removeAccount(session.user.id)
    }
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },

  switchAccount: async (userId) => {
    set({ switching: true })
    try {
      const accounts = getSavedAccounts()
      const target = accounts.find((a) => a.userId === userId)
      if (!target) throw new Error('Account not found')

      const { error } = await supabase.auth.refreshSession({
        refresh_token: target.refreshToken,
      })

      if (error) {
        removeAccount(userId)
        throw new Error('Session expired. Please log in again.')
      }

      queryClient.clear()
      // onAuthStateChange fires automatically → profile fetches → account upserted
    } finally {
      set({ switching: false })
    }
  },
}))
