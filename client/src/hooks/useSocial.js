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

export function usePickComments(pickId) {
  return useQuery({
    queryKey: ['pickComments', pickId],
    queryFn: () => api.get(`/social/picks/${pickId}/comments`),
    enabled: !!pickId,
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pickId, content }) =>
      api.post(`/social/picks/${pickId}/comments`, { content }),
    onSuccess: (_data, { pickId }) => {
      queryClient.invalidateQueries({ queryKey: ['pickComments', pickId] })
    },
  })
}

export function useDeleteComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ commentId, pickId }) => api.delete(`/social/comments/${commentId}`),
    onSuccess: (_data, { pickId }) => {
      queryClient.invalidateQueries({ queryKey: ['pickComments', pickId] })
    },
  })
}
