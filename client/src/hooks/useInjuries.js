import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useInjuryCounts(gameIds) {
  const ids = gameIds?.join(',') || ''
  return useQuery({
    queryKey: ['injuries', 'counts', ids],
    queryFn: () => api.get(`/injuries/counts?game_ids=${ids}`),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export function useInjuryDetail(gameId) {
  return useQuery({
    queryKey: ['injuries', 'detail', gameId],
    queryFn: () => api.get(`/injuries/${gameId}`),
    enabled: !!gameId,
    staleTime: 5 * 60 * 1000,
  })
}
