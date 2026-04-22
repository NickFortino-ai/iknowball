import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

export function usePropPick(propPickId) {
  return useQuery({
    queryKey: ['propPicks', propPickId],
    queryFn: () => api.get(`/props/picks/${propPickId}`),
    enabled: !!propPickId,
  })
}

export function useFeaturedProps(date, { fallback = false } = {}) {
  return useQuery({
    queryKey: ['featuredProps', date, fallback],
    queryFn: () => api.get(`/props/featured?date=${date}${fallback ? '&fallback=true' : ''}`),
    enabled: !!date,
  })
}

export function useMyPropPicks(status) {
  const params = status ? `?status=${status}` : ''
  return useQuery({
    queryKey: ['propPicks', 'me', status],
    queryFn: () => api.get(`/props/picks/me${params}`),
    // The list query is now cheap (no ESPN round-trips) and only needs to
    // catch status transitions, so we can poll it more conservatively. Live
    // stats are served by useMyPropLiveStats on its own 30s cadence.
    refetchInterval: (query) => {
      const hasLive = query.state.data?.some((p) => p.status === 'locked' && p.player_props?.games?.status === 'live')
      return hasLive ? 120000 : undefined
    },
  })
}

export function usePropPickHistory() {
  return useQuery({
    queryKey: ['propPicks', 'history'],
    queryFn: () => api.get('/props/picks/me/history'),
    refetchInterval: (query) => {
      const hasLocked = query.state.data?.some((p) => p.status === 'locked')
      const hasLive = query.state.data?.some((p) => p.status === 'locked' && p.player_props?.games?.status === 'live')
      // When games are live, poll faster to catch settlements; when there are
      // locked picks but no live games yet, poll to catch game status transitions
      return hasLive ? 60000 : hasLocked ? 120000 : undefined
    },
  })
}

/**
 * Live prop-pick stats — polled separately from the pick list so the (heavier)
 * ESPN fallback only runs on this cadence, not on every list refetch. Returns
 * a `{ [pickId]: number }` map. Caller merges into picks at render time.
 *
 * `enabled` is gated on whether the caller actually has any locked picks
 * with a live game, so this stays free for users with no active picks.
 */
export function useMyPropLiveStats({ hasLive } = {}) {
  return useQuery({
    queryKey: ['propPicks', 'liveStats'],
    queryFn: () => api.get('/props/picks/me/live-stats'),
    enabled: !!hasLive,
    refetchInterval: hasLive ? 30000 : undefined,
  })
}

export function useSubmitPropPick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ propId, pickedSide }) =>
      api.post('/props/picks', { prop_id: propId, picked_side: pickedSide }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propPicks'] })
      const uid = useAuthStore.getState().session?.user?.id
      if (uid) localStorage.setItem(`ikb_welcome_first_pick_${uid}`, '1')
    },
  })
}

export function useDeletePropPick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (propId) => api.delete(`/props/picks/${propId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propPicks'] })
    },
  })
}
