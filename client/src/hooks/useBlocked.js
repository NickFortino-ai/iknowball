import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useBlockedUsers() {
  return useQuery({
    queryKey: ['blockedUsers'],
    queryFn: () => api.get('/users/me/blocked'),
  })
}

export function useBlockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (blockedId) => api.post('/users/me/block', { blocked_id: blockedId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] })
      queryClient.invalidateQueries({ queryKey: ['connectionActivity'] })
      queryClient.invalidateQueries({ queryKey: ['connectionStatus'] })
    },
  })
}

export function useUnblockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (blockedId) => api.delete(`/users/me/block/${blockedId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] })
    },
  })
}
