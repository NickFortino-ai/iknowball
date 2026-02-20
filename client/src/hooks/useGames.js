import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useActiveSports() {
  return useQuery({
    queryKey: ['games', 'active-sports'],
    queryFn: () => api.get('/games/active-sports'),
  })
}

export function useGames(sport, status, days = 3) {
  const params = new URLSearchParams()
  if (sport) params.set('sport', sport)
  if (status) params.set('status', status)
  if (days) params.set('days', days)
  const qs = params.toString()

  const query = useQuery({
    queryKey: ['games', sport, status, days],
    queryFn: () => api.get(`/games${qs ? `?${qs}` : ''}`),
    refetchInterval: (query) => {
      const hasLive = query.state.data?.some((g) => g.status === 'live')
      return hasLive ? 10_000 : 30_000
    },
  })
  return query
}
