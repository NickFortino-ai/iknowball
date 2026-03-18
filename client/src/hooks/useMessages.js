import { useEffect } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

export function useConversations() {
  return useQuery({
    queryKey: ['messages', 'conversations'],
    queryFn: () => api.get('/messages'),
  })
}

export function useUnreadMessageCount(enabled = true) {
  return useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn: () => api.get('/messages/unread-count'),
    refetchInterval: 30_000,
    enabled,
  })
}

export function useThread(partnerId) {
  return useInfiniteQuery({
    queryKey: ['messages', 'thread', partnerId],
    queryFn: ({ pageParam }) => {
      const params = pageParam ? `?before=${pageParam}` : ''
      return api.get(`/messages/${partnerId}${params}`)
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !!partnerId,
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ partnerId, content }) => api.post(`/messages/${partnerId}`, { content }),
    onSuccess: (data, { partnerId }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', 'thread', partnerId] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] })
    },
  })
}

export function useMarkThreadRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (partnerId) => api.post(`/messages/${partnerId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] })
    },
  })
}

export function useRealtimeMessages(userId) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('dm-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}
