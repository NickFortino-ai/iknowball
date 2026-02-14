import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useAdminPropsForGame(gameId) {
  return useQuery({
    queryKey: ['adminProps', gameId],
    queryFn: () => api.get(`/admin/props/game/${gameId}`),
    enabled: !!gameId,
  })
}

export function useAdminFeaturedProps() {
  return useQuery({
    queryKey: ['adminFeaturedProps'],
    queryFn: () => api.get('/admin/props/featured'),
  })
}

export function useSyncProps() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ gameId, markets }) =>
      api.post('/admin/props/sync', { gameId, markets }),
    onSuccess: (_, { gameId }) => {
      queryClient.invalidateQueries({ queryKey: ['adminProps', gameId] })
    },
  })
}

export function useFeatureProp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ propId, featuredDate }) =>
      api.post('/admin/props/feature', { propId, featuredDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminProps'] })
      queryClient.invalidateQueries({ queryKey: ['adminFeaturedProps'] })
      queryClient.invalidateQueries({ queryKey: ['featuredProp'] })
    },
  })
}

export function useUnfeatureProp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (propId) => api.post(`/admin/props/${propId}/unfeature`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminProps'] })
      queryClient.invalidateQueries({ queryKey: ['adminFeaturedProps'] })
      queryClient.invalidateQueries({ queryKey: ['featuredProp'] })
    },
  })
}

export function useSettleProps() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settlements) => api.post('/admin/props/settle', { settlements }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminProps'] })
      queryClient.invalidateQueries({ queryKey: ['adminFeaturedProps'] })
      queryClient.invalidateQueries({ queryKey: ['featuredProp'] })
      queryClient.invalidateQueries({ queryKey: ['propPicks'] })
    },
  })
}

export function useSyncOdds() {
  return useMutation({
    mutationFn: () => api.post('/admin/sync-odds'),
  })
}

export function useScoreGames() {
  return useMutation({
    mutationFn: () => api.post('/admin/score-games'),
  })
}

// Bracket Templates
export function useBracketTemplates(sport) {
  return useQuery({
    queryKey: ['adminBracketTemplates', sport],
    queryFn: () => api.get(`/admin/bracket-templates${sport ? `?sport=${sport}` : ''}`),
  })
}

export function useBracketTemplate(templateId) {
  return useQuery({
    queryKey: ['adminBracketTemplates', templateId],
    queryFn: () => api.get(`/admin/bracket-templates/${templateId}`),
    enabled: !!templateId,
  })
}

export function useCreateBracketTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data) => api.post('/admin/bracket-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBracketTemplates'] })
      queryClient.invalidateQueries({ queryKey: ['bracketTemplates'] })
    },
  })
}

export function useUpdateBracketTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, ...data }) => api.patch(`/admin/bracket-templates/${templateId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBracketTemplates'] })
      queryClient.invalidateQueries({ queryKey: ['bracketTemplates'] })
    },
  })
}

export function useSaveBracketTemplateMatchups() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, matchups }) =>
      api.post(`/admin/bracket-templates/${templateId}/matchups`, { matchups }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBracketTemplates'] })
    },
  })
}

export function useDeleteBracketTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (templateId) => api.delete(`/admin/bracket-templates/${templateId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBracketTemplates'] })
      queryClient.invalidateQueries({ queryKey: ['bracketTemplates'] })
    },
  })
}
