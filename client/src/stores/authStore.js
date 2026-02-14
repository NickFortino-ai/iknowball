import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

export const useAuthStore = create((set, get) => ({
  session: null,
  profile: null,
  loading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, loading: false })

    if (session) {
      get().fetchProfile()
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session })
      if (session) {
        get().fetchProfile()
      } else {
        set({ profile: null })
      }
    })
  },

  fetchProfile: async () => {
    try {
      const profile = await api.get('/users/me')
      set({ profile })
    } catch {
      set({ profile: null })
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
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },
}))
