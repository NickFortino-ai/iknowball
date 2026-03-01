import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function usePickReactions(pickId) {
  return useQuery({
    queryKey: ['pickReactions', pickId],
    queryFn: () => api.get(`/social/picks/${pickId}/reactions`),
    enabled: !!pickId,
  })
}

export function useToggleReaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pickId, reactionType }) =>
      api.post(`/social/picks/${pickId}/reactions`, { reaction_type: reactionType }),
    onSuccess: (_data, { pickId }) => {
      queryClient.invalidateQueries({ queryKey: ['pickReactions', pickId] })
      queryClient.invalidateQueries({ queryKey: ['pickReactionsBatch'] })
    },
  })
}

export function usePickReactionsBatch(pickIds) {
  const key = pickIds?.length ? pickIds.join(',') : ''
  return useQuery({
    queryKey: ['pickReactionsBatch', key],
    queryFn: () => api.get(`/social/picks/reactions/batch?pickIds=${key}`),
    enabled: !!pickIds?.length,
  })
}

const COMMENT_ROUTES = {
  pick: (id) => `/social/picks/${id}/comments`,
  parlay: (id) => `/social/parlays/${id}/comments`,
  prop: (id) => `/social/props/${id}/comments`,
  streak_event: (id) => `/social/streak-events/${id}/comments`,
  record_history: (id) => `/social/records/${id}/comments`,
}

export function useComments(targetType, targetId) {
  return useQuery({
    queryKey: ['comments', targetType, targetId],
    queryFn: () => api.get(COMMENT_ROUTES[targetType](targetId)),
    enabled: !!targetId,
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ targetType, targetId, content }) =>
      api.post(COMMENT_ROUTES[targetType](targetId), { content }),
    onSuccess: (_data, { targetType, targetId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] })
    },
  })
}

export function useDeleteComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ commentId }) => api.delete(`/social/comments/${commentId}`),
    onSuccess: (_data, { targetType, targetId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] })
    },
  })
}

// --- Feed Reactions ---

export function useToggleFeedReaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ targetType, targetId, reactionType }) =>
      api.post('/social/feed/reactions', {
        target_type: targetType,
        target_id: targetId,
        reaction_type: reactionType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedReactionsBatch'] })
    },
  })
}

export function useFeedReactionsBatch(items) {
  const key = items?.length ? JSON.stringify(items) : ''
  return useQuery({
    queryKey: ['feedReactionsBatch', key],
    queryFn: () => api.get(`/social/feed/reactions/batch?items=${encodeURIComponent(JSON.stringify(items))}`),
    enabled: !!items?.length,
  })
}

// Backward-compatible aliases
export function usePickComments(pickId) {
  return useComments('pick', pickId)
}
