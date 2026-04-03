import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useNews(sport) {
  return useQuery({
    queryKey: ['news', sport],
    queryFn: () => api.get(`/news?sport=${sport}`),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}
