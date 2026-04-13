import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ── Rankings ─────────────────────────────────────────────────────────

export function useDraftPrepRankings(scoringFormat, configHash) {
  return useQuery({
    queryKey: ['draftPrep', 'rankings', scoringFormat, configHash],
    queryFn: () => api.get(`/draft-prep/rankings?scoring=${scoringFormat}&config=${configHash}`),
    enabled: !!configHash && !!scoringFormat,
  })
}

export function useSetDraftPrepRankings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ scoringFormat, configHash, playerIds }) =>
      api.put('/draft-prep/rankings', { scoringFormat, configHash, playerIds }),
    onSuccess: (_d, { scoringFormat, configHash }) => {
      queryClient.invalidateQueries({ queryKey: ['draftPrep', 'rankings', scoringFormat, configHash] })
      // Also invalidate any synced league rankings
      queryClient.invalidateQueries({ queryKey: ['leagues'], predicate: (q) => q.queryKey[3] === 'myRankings' })
    },
  })
}

export function useResetDraftPrepRankings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ scoringFormat, configHash }) =>
      api.post('/draft-prep/rankings/reset', { scoringFormat, configHash }),
    onSuccess: (_d, { scoringFormat, configHash }) => {
      queryClient.invalidateQueries({ queryKey: ['draftPrep', 'rankings', scoringFormat, configHash] })
      queryClient.invalidateQueries({ queryKey: ['leagues'], predicate: (q) => q.queryKey[3] === 'myRankings' })
    },
  })
}

// ── Sync ─────────────────────────────────────────────────────────────

export function useDraftPrepSync() {
  return useQuery({
    queryKey: ['draftPrep', 'sync'],
    queryFn: () => api.get('/draft-prep/sync'),
  })
}

export function useSyncLeague() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leagueId) => api.post('/draft-prep/sync', { leagueId }),
    onSuccess: (_d, leagueId) => {
      queryClient.invalidateQueries({ queryKey: ['draftPrep', 'sync'] })
      queryClient.invalidateQueries({ queryKey: ['draftPrep', 'matchingLeagues'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'myRankings'] })
    },
  })
}

export function useUnsyncLeague() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leagueId) => api.delete(`/draft-prep/sync/${leagueId}`),
    onSuccess: (_d, leagueId) => {
      queryClient.invalidateQueries({ queryKey: ['draftPrep', 'sync'] })
      queryClient.invalidateQueries({ queryKey: ['draftPrep', 'matchingLeagues'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'myRankings'] })
    },
  })
}

export function useSyncAllLeagues() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ mode, configHash, scoringFormat }) =>
      api.post('/draft-prep/sync-all', { mode, configHash, scoringFormat }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draftPrep'] })
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

// ── ADP ──────────────────────────────────────────────────────────────

export function useAdpData(scoringFormat, position) {
  return useQuery({
    queryKey: ['draftPrep', 'adp', scoringFormat, position || 'All'],
    queryFn: () => {
      const params = new URLSearchParams({ scoring: scoringFormat })
      if (position && position !== 'All') params.set('position', position)
      return api.get(`/draft-prep/adp?${params}`)
    },
    enabled: !!scoringFormat,
  })
}

// ── Matching Leagues ─────────────────────────────────────────────────

export function useMatchingLeagues(configHash, scoringFormat) {
  return useQuery({
    queryKey: ['draftPrep', 'matchingLeagues', configHash, scoringFormat],
    queryFn: () => api.get(`/draft-prep/matching-leagues?config=${configHash}&scoring=${scoringFormat}`),
    enabled: !!configHash && !!scoringFormat,
  })
}
