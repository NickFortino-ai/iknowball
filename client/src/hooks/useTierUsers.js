import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useTierUsers(tierName) {
  return useQuery({
    queryKey: ['tierUsers', tierName],
    queryFn: () => api.get(`/leaderboard/tier/${encodeURIComponent(tierName)}`),
    enabled: !!tierName,
  })
}
