import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useCreateHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ content, team_tag }) =>
      api.post('/hot-takes', { content, team_tag }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useUserHotTakes(userId) {
  return useQuery({
    queryKey: ['hotTakes', 'user', userId],
    queryFn: () => api.get(`/hot-takes/user/${userId}`),
    enabled: !!userId,
  })
}

export function useRemindHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (hotTakeId) => api.post(`/hot-takes/${hotTakeId}/remind`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useDeleteHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (hotTakeId) => api.delete(`/hot-takes/${hotTakeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}
