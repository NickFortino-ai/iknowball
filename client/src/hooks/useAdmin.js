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

export function useRecalculatePoints() {
  return useMutation({
    mutationFn: () => api.post('/admin/recalculate-points'),
  })
}

export function useRecalculateRecords() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/admin/recalculate-records'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records'] })
      queryClient.invalidateQueries({ queryKey: ['royalty'] })
    },
  })
}

export function useSendEmailBlast() {
  return useMutation({
    mutationFn: ({ subject, body }) => api.post('/admin/email-blast', { subject, body }),
  })
}

export function useSendTargetedEmail() {
  return useMutation({
    mutationFn: ({ subject, body, usernames }) => api.post('/admin/email-targeted', { subject, body, usernames }),
  })
}

// Futures
export function useSyncFutures() {
  return useMutation({
    mutationFn: () => api.post('/admin/futures/sync-all'),
  })
}

export function useAdminFuturesMarkets(sport) {
  return useQuery({
    queryKey: ['adminFuturesMarkets', sport],
    queryFn: () => api.get(`/admin/futures/markets${sport ? `?sport=${sport}` : ''}`),
  })
}

export function useCloseFuturesMarket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (marketId) => api.post(`/admin/futures/markets/${marketId}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFuturesMarkets'] })
      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] })
    },
  })
}

export function useSettleFuturesMarket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ marketId, winningOutcome }) =>
      api.post('/admin/futures/settle', { marketId, winningOutcome }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFuturesMarkets'] })
      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] })
      queryClient.invalidateQueries({ queryKey: ['futuresPicks'] })
    },
  })
}

// Team names for bracket autocomplete
export function useTeamsForSport(sport) {
  return useQuery({
    queryKey: ['adminTeams', sport],
    queryFn: () => api.get(`/admin/teams?sport=${sport}`),
    enabled: !!sport,
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

export function useEnterTemplateResult() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, templateMatchupId, winner }) =>
      api.post(`/admin/bracket-templates/${templateId}/results`, {
        template_matchup_id: templateMatchupId,
        winner,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminBracketTemplates', variables.templateId] })
    },
  })
}

export function useUndoTemplateResult() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, templateMatchupId }) =>
      api.delete(`/admin/bracket-templates/${templateId}/results/${templateMatchupId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminBracketTemplates', variables.templateId] })
    },
  })
}

// Weekly Recap
export function useUpdateRecap() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ recapId, recap_content }) =>
      api.patch(`/admin/recaps/${recapId}`, { recap_content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recaps'] })
    },
  })
}

export function useGenerateRecap() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post('/admin/generate-recap'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recaps'] })
    },
  })
}
