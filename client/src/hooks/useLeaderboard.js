import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLeaderboard(scope = 'global', sport) {
  const params = new URLSearchParams({ scope })
  if (sport) params.set('sport', sport)

  return useQuery({
    queryKey: ['leaderboard', scope, sport],
    queryFn: () => api.get(`/leaderboard?${params}`),
  })
}
