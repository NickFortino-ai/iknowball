import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useGames(sport, status) {
  const params = new URLSearchParams()
  if (sport) params.set('sport', sport)
  if (status) params.set('status', status)
  const qs = params.toString()

  return useQuery({
    queryKey: ['games', sport, status],
    queryFn: () => api.get(`/games${qs ? `?${qs}` : ''}`),
  })
}
