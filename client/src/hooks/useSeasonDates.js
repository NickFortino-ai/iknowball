import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// Fetch admin-defined per-sport season start / end / playoff-end dates.
// Mount this hook once at app root (via useSeasonDatesPrimer) so the
// synchronous helpers in lib/seasonDates.js can read from the react-
// query cache when computing isSeasonUnderway / arePlayoffsUnderway.
//
// Long staleTime because these dates change annually at most — no
// need to refetch aggressively. Cached across all pages via the
// shared queryClient.
export function useSeasonDates() {
  return useQuery({
    queryKey: ['season-dates'],
    queryFn: () => api.get('/season-dates'),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
  })
}

// Mount at app root so the cache is populated before any component
// asks isSeasonUnderway / arePlayoffsUnderway. The hook itself doesn't
// need to render anything — the side effect is filling the cache.
export function useSeasonDatesPrimer() {
  useSeasonDates()
}
