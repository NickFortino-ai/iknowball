import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useMyParlays(status) {
  const params = status ? `?status=${status}` : ''
  return useQuery({
    queryKey: ['parlays', 'me', status],
    queryFn: () => api.get(`/parlays/me${params}`),
  })
}

export function useParlayHistory() {
  return useQuery({
    queryKey: ['parlays', 'history'],
    queryFn: () => api.get('/parlays/me/history'),
  })
}

export function useCreateParlay() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (legs) => api.post('/parlays', { legs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parlays'] })
    },
  })
}

export function useDeleteParlay() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (parlayId) => api.delete(`/parlays/${parlayId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parlays'] })
    },
  })
}
