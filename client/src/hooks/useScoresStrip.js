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

// Historical finals for a specific PT date + sport. Powers the Final
// section's date scrubber — user clicks the left arrow, we fetch.
// Finals for a past day never change so staleTime is generous.
export function useFinalsForDate(sport, date) {
  return useQuery({
    queryKey: ['scoresFinals', sport, date],
    queryFn: () => api.get(`/scores/finals?sport=${sport}&date=${date}`),
    staleTime: 5 * 60 * 1000,
    enabled: !!sport && !!date,
    retry: false,
  })
}

// All games (upcoming + live + final) for a sport on a specific PT
// date — powers the drill-in /scores/:sport page's date scrubber.
// Auto-polls fast when anything on the day is live.
export function useScoresForDay(sport, date) {
  return useQuery({
    queryKey: ['scoresDay', sport, date],
    queryFn: () => api.get(`/scores/day?sport=${sport}&date=${date}`),
    staleTime: 15 * 1000,
    enabled: !!sport && !!date,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!Array.isArray(data)) return 60 * 1000
      const anyLive = data.some((g) => g.status === 'live')
      return anyLive ? 20 * 1000 : 5 * 60 * 1000
    },
    refetchIntervalInBackground: false,
    retry: false,
  })
}

// Full standings table for a sport. ESPN-fed with a 1h server cache;
// client staleTime of 10 min so switching tabs / navigating away and
// back doesn't refetch.
export function useSportStandings(sport) {
  return useQuery({
    queryKey: ['sportStandings', sport],
    queryFn: () => api.get(`/scores/standings?sport=${sport}`),
    staleTime: 10 * 60 * 1000,
    enabled: !!sport,
    retry: false,
  })
}

// Categorized season stat leaders for a sport (top 10 per category).
// Offseason sports fall back to prior season server-side.
export function useSportLeaders(sport) {
  return useQuery({
    queryKey: ['sportLeaders', sport],
    queryFn: () => api.get(`/scores/leaders?sport=${sport}`),
    staleTime: 10 * 60 * 1000,
    enabled: !!sport,
    retry: false,
  })
}
