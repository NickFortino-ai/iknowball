import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export function useConnectionActivity(scope = 'squad') {
  return useInfiniteQuery({
    queryKey: ['connections', 'activity', scope],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      if (pageParam) params.set('before', pageParam)
      params.set('scope', scope)
      return api.get(`/connections/activity?${params}`)
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
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

export function useRemoveConnection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (connectionId) => api.delete(`/connections/${connectionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
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

export function useStreakDetail(streakId) {
  return useQuery({
    queryKey: ['streak', streakId],
    queryFn: () => api.get(`/social/streaks/${streakId}`),
    enabled: !!streakId,
  })
}

export function useHeadToHeadHistory(userAId, userBId) {
  return useQuery({
    queryKey: ['h2h', userAId, userBId],
    queryFn: () => api.get(`/social/head-to-head/${userAId}/${userBId}`),
    enabled: !!userAId && !!userBId,
  })
}
