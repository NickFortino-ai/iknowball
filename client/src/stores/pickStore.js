import { create } from 'zustand'

export const usePickStore = create((set, get) => ({
  pendingPicks: {},

  setPick: (gameId, team) => {
    set((state) => ({
      pendingPicks: { ...state.pendingPicks, [gameId]: team },
    }))
  },

  removePick: (gameId) => {
    set((state) => {
      const { [gameId]: _, ...rest } = state.pendingPicks
      return { pendingPicks: rest }
    })
  },

  clearPicks: () => set({ pendingPicks: {} }),

  getPick: (gameId) => get().pendingPicks[gameId] || null,
}))
