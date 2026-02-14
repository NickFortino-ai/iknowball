import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useFeaturedProp(date) {
  return useQuery({
    queryKey: ['featuredProp', date],
    queryFn: () => api.get(`/props/featured?date=${date}`),
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
