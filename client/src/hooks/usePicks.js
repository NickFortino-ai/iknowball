import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useMyPicks(status) {
  const params = status ? `?status=${status}` : ''
  return useQuery({
    queryKey: ['picks', 'me', status],
    queryFn: () => api.get(`/picks/me${params}`),
  })
}

export function usePickHistory() {
  return useQuery({
    queryKey: ['picks', 'history'],
    queryFn: () => api.get('/picks/me/history'),
  })
}

export function usePickById(pickId) {
  return useQuery({
    queryKey: ['pick', pickId],
    queryFn: () => api.get(`/picks/${pickId}`),
    enabled: !!pickId,
  })
}

export function useSubmitPick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ gameId, pickedTeam }) =>
      api.post('/picks', { game_id: gameId, picked_team: pickedTeam }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picks'] })
    },
  })
}

export function useDeletePick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (gameId) => api.delete(`/picks/${gameId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picks'] })
    },
  })
}
