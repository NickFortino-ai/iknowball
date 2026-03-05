import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePropPick(propPickId) {
  return useQuery({
    queryKey: ['propPicks', propPickId],
    queryFn: () => api.get(`/props/picks/${propPickId}`),
    enabled: !!propPickId,
  })
}

export function useFeaturedProp(date, { fallback = false } = {}) {
  return useQuery({
    queryKey: ['featuredProp', date, fallback],
    queryFn: () => api.get(`/props/featured?date=${date}${fallback ? '&fallback=true' : ''}`),
    enabled: !!date,
  })
}

export function useMyPropPicks(status) {
  const params = status ? `?status=${status}` : ''
  return useQuery({
    queryKey: ['propPicks', 'me', status],
    queryFn: () => api.get(`/props/picks/me${params}`),
  })
}

export function usePropPickHistory() {
  return useQuery({
    queryKey: ['propPicks', 'history'],
    queryFn: () => api.get('/props/picks/me/history'),
  })
}

export function useSubmitPropPick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ propId, pickedSide }) =>
      api.post('/props/picks', { prop_id: propId, picked_side: pickedSide }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propPicks'] })
      localStorage.setItem('ikb_welcome_first_pick', '1')
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
