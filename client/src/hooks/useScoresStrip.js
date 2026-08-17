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
      const anyLive = ['nfl', 'nba', 'mlb', 'wnba', 'mls', 'ncaaf', 'ncaab'].some((s) => (data?.[s]?.live?.length || 0) > 0)
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

// NFL-only: full season week list + current week for the /scores/nfl
// drill-in's Week scrubber. Cached moderately — schedule doesn't
// move but 'current week' rolls over and preseason/regular boundary
// matters, so keep it fresh-ish. The ?v= query param busts any
// browser HTTP cache holding an older shape of this response; bump
// it when the response schema meaningfully changes.
export function useNflSchedule(enabled = true) {
  return useQuery({
    queryKey: ['nflSchedule', 'v2'],
    queryFn: () => api.get('/scores/nfl-schedule?v=2'),
    staleTime: 5 * 60 * 1000,
    enabled,
    retry: false,
  })
}

// NFL games for a specific (season, week, season_type). Poll cadence
// adaptive to whether any game in the week is live.
export function useNflWeekGames(season, week, seasonType = 'regular') {
  return useQuery({
    queryKey: ['nflWeekGames', season, week, seasonType],
    queryFn: () => api.get(`/scores/nfl-week?season=${season}&week=${week}&type=${seasonType}`),
    staleTime: 15 * 1000,
    enabled: !!season && !!week,
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

// NCAAF calendar — same shape as useNflSchedule (regular season only,
// no preseason). Powers the drill-in week scrubber.
export function useNcaafSchedule(enabled = true) {
  return useQuery({
    queryKey: ['ncaafSchedule'],
    queryFn: () => api.get('/scores/ncaaf-schedule'),
    staleTime: 5 * 60 * 1000,
    enabled,
    retry: false,
  })
}

// NCAAF games for a specific (season, week). Adaptive poll cadence.
export function useNcaafWeekGames(season, week) {
  return useQuery({
    queryKey: ['ncaafWeekGames', season, week],
    queryFn: () => api.get(`/scores/ncaaf-week?season=${season}&week=${week}`),
    staleTime: 15 * 1000,
    enabled: !!season && !!week,
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

// Per-game payload for the Game Center modal (scoreboard + own results
// tap-in). Finals never change so staleTime is long; live games poll
// every 30s so the box score / score / clock actually moves while the
// modal is open.
export function useBoxScore(gameId) {
  return useQuery({
    queryKey: ['boxScore', gameId],
    queryFn: () => api.get(`/scores/box/${gameId}`),
    enabled: !!gameId,
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      return data.status === 'live' ? 30 * 1000 : false
    },
    refetchIntervalInBackground: false,
    retry: false,
  })
}
