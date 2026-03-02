import { useMutation, useQueryClient } from '@tanstack/react-query'
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

export function useDeleteHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (hotTakeId) => api.delete(`/hot-takes/${hotTakeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}
