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

  // Parlay slip state
  parlayMode: false,
  parlayLegs: [],

  setParlayMode: (on) => {
    set({ parlayMode: on, parlayLegs: [] })
  },

  addParlayLeg: (gameId, pickedTeam, game) => {
    const { parlayLegs } = get()
    if (parlayLegs.length >= 5) return
    if (parlayLegs.some((l) => l.gameId === gameId)) return
    set({ parlayLegs: [...parlayLegs, { gameId, pickedTeam, game }] })
  },

  removeParlayLeg: (gameId) => {
    set((state) => ({
      parlayLegs: state.parlayLegs.filter((l) => l.gameId !== gameId),
    }))
  },

  updateParlayLeg: (gameId, pickedTeam) => {
    set((state) => ({
      parlayLegs: state.parlayLegs.map((l) =>
        l.gameId === gameId ? { ...l, pickedTeam } : l
      ),
    }))
  },

  clearParlayLegs: () => set({ parlayLegs: [] }),
}))
