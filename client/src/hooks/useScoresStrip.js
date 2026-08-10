import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// Public landing-page scores. Polls faster when any sport has a live
// game in the returned payload — the same 20s cadence used by the
// picks/DFS live-scoring hooks — otherwise a slower background poll
// keeps things fresh without hammering the API on a Wednesday morning.
export function useScoresStrip() {
  return useQuery({
    queryKey: ['scoresStrip'],
    queryFn: () => api.get('/scores/strip'),
    staleTime: 15 * 1000,
    // Auto-adaptive refetch: 20s if anything's live, 5min otherwise.
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 60 * 1000
      const anyLive = ['nfl', 'nba', 'mlb', 'wnba'].some((s) => (data?.[s]?.live?.length || 0) > 0)
      return anyLive ? 20 * 1000 : 5 * 60 * 1000
    },
    refetchIntervalInBackground: false,
    retry: false,
  })
}
