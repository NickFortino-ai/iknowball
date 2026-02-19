import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get('/connections'),
  })
}

export function useConnectionStatus(userId) {
  return useQuery({
    queryKey: ['connections', 'status', userId],
    queryFn: () => api.get(`/connections/status/${userId}`),
    enabled: !!userId,
  })
}

export function usePendingConnectionRequests(enabled = true) {
  return useQuery({
    queryKey: ['connections', 'pending'],
    queryFn: () => api.get('/connections/pending'),
    refetchInterval: 30_000,
    enabled,
  })
}

export function useConnectionActivity() {
  return useQuery({
    queryKey: ['connections', 'activity'],
    queryFn: () => api.get('/connections/activity'),
  })
}

export function useSendConnectionRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (username) => api.post('/connections/request', { username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
    },
  })
}

export function useAcceptConnectionRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (connectionId) => api.post(`/connections/${connectionId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['connections', 'pending'] })
    },
  })
}

export function useDeclineConnectionRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (connectionId) => api.post(`/connections/${connectionId}/decline`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'pending'] })
    },
  })
}

export function useSharePickToSquad() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (pickId) => api.post('/connections/share', { pick_id: pickId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}
