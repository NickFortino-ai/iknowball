import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLeaderboard(scope = 'global', sport) {
  const params = new URLSearchParams({ scope })
  if (sport) params.set('sport', sport)

  return useQuery({
    queryKey: ['leaderboard', scope, sport],
    queryFn: () => api.get(`/leaderboard?${params}`),
    refetchInterval: 60_000,
  })
}

// Autocomplete for the leaderboard search bar. Only fires at >= 3 chars
// (product decision: solves the "too many matches" issue naturally).
// includeSelf=true so the user can search for themselves.
export function useUserSearch(q) {
  const query = (q || '').trim()
  const enabled = query.length >= 3
  return useQuery({
    queryKey: ['userSearch', query],
    queryFn: () => api.get(`/users/search?q=${encodeURIComponent(query)}&includeSelf=true`),
    enabled,
    staleTime: 30_000,
  })
}

// Rank of a specific user on a specific leaderboard scope. Used by the
// search feature to show a single-row result when the user picks a
// suggestion from the autocomplete.
export function useUserRankOnLeaderboard(userId, scope = 'global', sport) {
  const params = new URLSearchParams({ scope })
  if (userId) params.set('userId', userId)
  if (sport) params.set('sport', sport)

  return useQuery({
    queryKey: ['leaderboard', 'user-rank', userId, scope, sport],
    queryFn: () => api.get(`/leaderboard/user-rank?${params}`),
    enabled: !!userId,
  })
}
