import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useGames(sport, status, days = 3) {
  const params = new URLSearchParams()
  if (sport) params.set('sport', sport)
  if (status) params.set('status', status)
  if (days) params.set('days', days)
  const qs = params.toString()

  return useQuery({
    queryKey: ['games', sport, status, days],
    queryFn: () => api.get(`/games${qs ? `?${qs}` : ''}`),
  })
}
