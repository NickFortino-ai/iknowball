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
      queryClient.invalidateQueries({ queryKey: ['featuredProps'] })
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
      queryClient.invalidateQueries({ queryKey: ['featuredProps'] })
    },
  })
}

export function useVoidProp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (propId) => api.post(`/admin/props/${propId}/void`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminProps'] })
      queryClient.invalidateQueries({ queryKey: ['adminFeaturedProps'] })
      queryClient.invalidateQueries({ queryKey: ['featuredProps'] })
      queryClient.invalidateQueries({ queryKey: ['propPicks'] })
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
      queryClient.invalidateQueries({ queryKey: ['featuredProps'] })
      queryClient.invalidateQueries({ queryKey: ['propPicks'] })
    },
  })
}

export function useSyncOdds() {
  return useMutation({
    mutationFn: () => api.post('/admin/sync-odds'),
  })
}

export function useSyncInjuries() {
  return useMutation({
    mutationFn: () => api.post('/admin/sync-injuries'),
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

export function useSyncNBASalaries() {
  return useMutation({
    mutationFn: (date) => api.post('/admin/nba-dfs/generate-salaries', { date, season: 2026 }),
  })
}

export function useSyncMLBSalaries() {
  return useMutation({
    mutationFn: (date) => api.post('/admin/mlb-dfs/generate-salaries', { date, season: 2026 }),
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
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subject, body, scheduled_at }) => api.post('/admin/email-blast', { subject, body, scheduled_at }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'email-logs'] }),
  })
}

export function useSendTargetedEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subject, body, usernames, scheduled_at }) => api.post('/admin/email-targeted', { subject, body, usernames, scheduled_at }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'email-logs'] }),
  })
}

export function useEmailLogs() {
  return useQuery({
    queryKey: ['admin', 'email-logs'],
    queryFn: () => api.get('/admin/email-logs'),
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

export function useCreateFuturesMarket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/admin/futures/create', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFuturesMarkets'] })
      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] })
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
    mutationFn: ({ templateId, templateMatchupId, winner, scoreTop, scoreBottom, seriesWinsTop, seriesWinsBottom }) =>
      api.post(`/admin/bracket-templates/${templateId}/results`, {
        template_matchup_id: templateMatchupId,
        winner,
        score_top: scoreTop != null ? Number(scoreTop) : undefined,
        score_bottom: scoreBottom != null ? Number(scoreBottom) : undefined,
        series_wins_top: seriesWinsTop != null ? Number(seriesWinsTop) : undefined,
        series_wins_bottom: seriesWinsBottom != null ? Number(seriesWinsBottom) : undefined,
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

// Bracket Championship Score
export function useSetChampionshipScore() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, totalScore }) =>
      api.post(`/admin/bracket-templates/${templateId}/championship-score`, { total_score: totalScore }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminBracketTemplates', variables.templateId] })
    },
  })
}

// Template Bracket Email
export function useSendTemplateBracketEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subject, body, templateId, scheduled_at }) =>
      api.post('/admin/email-template-blast', { subject, body, templateId, scheduled_at }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'email-logs'] }),
  })
}

export function useBracketTemplateUserCount(templateId) {
  return useQuery({
    queryKey: ['admin', 'bracket-template-user-count', templateId],
    queryFn: () => api.get(`/admin/bracket-templates/${templateId}/user-count`),
    enabled: !!templateId,
  })
}

// Content Moderation
export function useBannedWords() {
  return useQuery({
    queryKey: ['admin', 'banned-words'],
    queryFn: () => api.get('/admin/banned-words'),
  })
}

export function useAddBannedWord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (word) => api.post('/admin/banned-words', { word }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'banned-words'] }),
  })
}

export function useRemoveBannedWord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/admin/banned-words/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'banned-words'] }),
  })
}

export function useMutedUsers() {
  return useQuery({
    queryKey: ['admin', 'muted-users'],
    queryFn: () => api.get('/admin/muted-users'),
  })
}

export function useMuteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId) => api.post(`/admin/users/${userId}/mute`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'muted-users'] }),
  })
}

export function useUnmuteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId) => api.post(`/admin/users/${userId}/unmute`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'muted-users'] }),
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

// Player Search (for position overrides)
export function useAdminPlayerSearch(query) {
  return useQuery({
    queryKey: ['admin', 'player-search', query],
    queryFn: () => api.get(`/admin/player-search?q=${encodeURIComponent(query)}`),
    enabled: !!query && query.length >= 2,
    staleTime: 30_000,
  })
}

// Player Position Overrides
export function usePlayerPositionOverrides() {
  return useQuery({
    queryKey: ['admin', 'position-overrides'],
    queryFn: () => api.get('/admin/player-position-overrides'),
  })
}

export function useCreatePositionOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/admin/player-position-overrides', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'position-overrides'] }),
  })
}

export function useDeletePositionOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/admin/player-position-overrides/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'position-overrides'] }),
  })
}

// Admin pending counts (badge indicators)
export function useAdminPendingCounts() {
  return useQuery({
    queryKey: ['admin', 'pending-counts'],
    queryFn: () => api.get('/admin/pending-counts'),
    refetchInterval: 60_000, // poll every minute
  })
}

// Backdrop submissions
export function useBackdropSubmissions() {
  return useQuery({
    queryKey: ['admin', 'backdrop-submissions'],
    queryFn: () => api.get('/admin/backdrop-submissions'),
  })
}

export function useApproveBackdrop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/admin/backdrop-submissions/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'backdrop-submissions'] }),
  })
}

export function useRejectBackdrop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }) => api.post(`/admin/backdrop-submissions/${id}/reject`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'backdrop-submissions'] }),
  })
}
