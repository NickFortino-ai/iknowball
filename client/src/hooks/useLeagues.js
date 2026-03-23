import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

export function useMyLeagues() {
  return useQuery({
    queryKey: ['leagues'],
    queryFn: () => api.get('/leagues'),
  })
}

export function useMyLeagueWins() {
  return useQuery({
    queryKey: ['leagues', 'my-wins'],
    queryFn: () => api.get('/leagues/my-wins'),
  })
}

export function useLeague(id) {
  return useQuery({
    queryKey: ['leagues', id],
    queryFn: () => api.get(`/leagues/${id}`),
    enabled: !!id,
  })
}

export function useLeagueMembers(id) {
  return useQuery({
    queryKey: ['leagues', id, 'members'],
    queryFn: () => api.get(`/leagues/${id}/members`),
    enabled: !!id,
  })
}

export function useLeagueStandings(id) {
  return useQuery({
    queryKey: ['leagues', id, 'standings'],
    queryFn: () => api.get(`/leagues/${id}/standings`),
    enabled: !!id,
  })
}

export function useLeagueWeeks(id) {
  return useQuery({
    queryKey: ['leagues', id, 'weeks'],
    queryFn: () => api.get(`/leagues/${id}/weeks`),
    enabled: !!id,
  })
}

export function useCreateLeague() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data) => api.post('/leagues', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

export function useJoinLeague() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, inviteCode }) =>
      api.post(`/leagues/${leagueId || '_'}/join`, { invite_code: inviteCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

export function useUpdateLeague() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, ...data }) => api.patch(`/leagues/${leagueId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId] })
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

export function useToggleAutoConnect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, autoConnect }) =>
      api.patch(`/leagues/${leagueId}/auto-connect`, { auto_connect: autoConnect }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId] })
    },
  })
}

export function useDeleteLeague() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (leagueId) => api.delete(`/leagues/${leagueId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

export function useCompleteLeague() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/complete`),
    onSuccess: (_, leagueId) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

export function useLeaveLeague() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, userId }) => api.delete(`/leagues/${leagueId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

// Pick'em selections
export function usePickemSelections(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'pickem', 'selections'],
    queryFn: () => api.get(`/leagues/${leagueId}/pickem/selections`),
    enabled: !!leagueId,
  })
}

export function useSelectPickemGames() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, weekId, gameIds }) =>
      api.post(`/leagues/${leagueId}/pickem/selections`, { week_id: weekId, game_ids: gameIds }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'pickem'] })
    },
  })
}

// League Picks (new pick'em system)
export function useLeaguePicks(leagueId, weekId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'pickem', 'picks', weekId],
    queryFn: () => api.get(`/leagues/${leagueId}/pickem/picks${weekId ? `?week_id=${weekId}` : ''}`),
    enabled: !!leagueId,
  })
}

export function useLeagueGames(leagueId, weekId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'pickem', 'games', weekId],
    queryFn: () => api.get(`/leagues/${leagueId}/pickem/games?week_id=${weekId}`),
    enabled: !!leagueId && !!weekId,
  })
}

export function useSubmitLeaguePick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, weekId, gameId, pickedTeam }) =>
      api.post(`/leagues/${leagueId}/pickem/picks`, {
        week_id: weekId,
        game_id: gameId,
        picked_team: pickedTeam,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'pickem'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'standings'] })
    },
  })
}

export function useUserLeaguePicks(leagueId, userId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'pickem', 'member-picks', userId],
    queryFn: () => api.get(`/leagues/${leagueId}/pickem/member-picks/${userId}`),
    enabled: !!leagueId && !!userId,
  })
}

export function useDeleteLeaguePick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, gameId }) =>
      api.delete(`/leagues/${leagueId}/pickem/picks/${gameId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'pickem'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'standings'] })
    },
  })
}

// Survivor
export function useSurvivorBoard(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'survivor', 'board'],
    queryFn: () => api.get(`/leagues/${leagueId}/survivor/board`),
    enabled: !!leagueId,
  })
}

export function useUsedTeams(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'survivor', 'used-teams'],
    queryFn: () => api.get(`/leagues/${leagueId}/survivor/used-teams`),
    enabled: !!leagueId,
  })
}

export function useSubmitSurvivorPick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, weekId, gameId, pickedTeam }) =>
      api.post(`/leagues/${leagueId}/survivor/picks`, {
        week_id: weekId,
        game_id: gameId,
        picked_team: pickedTeam,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'survivor'] })
    },
  })
}

export function useSettleSurvivorLeague() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/survivor/settle`),
    onSuccess: (_, leagueId) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'survivor'] })
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

export function useDeleteSurvivorPick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, weekId }) =>
      api.delete(`/leagues/${leagueId}/survivor/picks/${weekId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'survivor'] })
    },
  })
}

// Squares
export function useSquaresBoard(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'squares', 'board'],
    queryFn: () => api.get(`/leagues/${leagueId}/squares/board`),
    enabled: !!leagueId,
  })
}

export function useClaimSquare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, rowPos, colPos }) =>
      api.post(`/leagues/${leagueId}/squares/claim`, { row_pos: rowPos, col_pos: colPos }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'squares'] })
    },
  })
}

export function useRandomAssignSquares() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/squares/random-assign`),
    onSuccess: (_, leagueId) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'squares'] })
    },
  })
}

export function useLockDigits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/squares/lock-digits`),
    onSuccess: (_, leagueId) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'squares'] })
    },
  })
}

export function useScoreQuarter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, quarter, awayScore, homeScore }) =>
      api.post(`/leagues/${leagueId}/squares/score-quarter`, {
        quarter,
        away_score: awayScore,
        home_score: homeScore,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'squares'] })
    },
  })
}

export function useUpdateBoardSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, ...settings }) =>
      api.patch(`/leagues/${leagueId}/squares/board`, settings),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'squares'] })
    },
  })
}

// Bracket
export function useBracketTournament(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'bracket', 'tournament'],
    queryFn: () => api.get(`/leagues/${leagueId}/bracket/tournament`),
    enabled: !!leagueId,
  })
}

export function useUpdateBracketTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leagueId, ...data }) =>
      api.patch(`/leagues/${leagueId}/bracket/tournament`, data),
    onSuccess: (_, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'bracket', 'tournament'] })
    },
  })
}

export function useBracketEntry(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'bracket', 'entry'],
    queryFn: () => api.get(`/leagues/${leagueId}/bracket/entry`),
    enabled: !!leagueId,
  })
}

export function useBracketEntries(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'bracket', 'entries'],
    queryFn: () => api.get(`/leagues/${leagueId}/bracket/entries`),
    enabled: !!leagueId,
  })
}

export function useViewBracketEntry(leagueId, userId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'bracket', 'entries', userId],
    queryFn: () => api.get(`/leagues/${leagueId}/bracket/entries/${userId}`),
    enabled: !!leagueId && !!userId,
  })
}

export function useMyOtherBracketEntries(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'bracket', 'my-other-entries'],
    queryFn: () => api.get(`/leagues/${leagueId}/bracket/my-other-entries`),
    enabled: !!leagueId,
  })
}

export function useSubmitBracket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, picks, entryName, tiebreakerScore }) =>
      api.post(`/leagues/${leagueId}/bracket/entry`, { picks, entry_name: entryName, tiebreaker_score: tiebreakerScore }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'bracket'] })
    },
  })
}

export function useBracketTemplatesActive(sport) {
  return useQuery({
    queryKey: ['bracketTemplates', 'active', sport],
    queryFn: () => api.get(`/leagues/bracket-templates/active${sport ? `?sport=${sport}` : ''}`),
  })
}

// ── League Thread ──

export function useLeagueThread(leagueId) {
  return useInfiniteQuery({
    queryKey: ['leagues', leagueId, 'thread'],
    queryFn: ({ pageParam }) =>
      api.get(`/leagues/${leagueId}/thread${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !!leagueId,
  })
}

export function useSendThreadMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leagueId, content, user_tags }) =>
      api.post(`/leagues/${leagueId}/thread`, { content, user_tags }),
    onSuccess: (_data, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'thread'] })
    },
  })
}

export function useRealtimeLeagueThread(leagueId) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`league-thread-${leagueId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'league_messages',
        filter: `league_id=eq.${leagueId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'thread'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, queryClient])
}

export function useThreadUnread(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'thread', 'unread'],
    queryFn: () => api.get(`/leagues/${leagueId}/thread/unread`),
    enabled: !!leagueId,
    staleTime: 30_000,
  })
}

export function useMarkThreadRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/thread/read`),
    onSuccess: (_data, leagueId) => {
      queryClient.setQueryData(['leagues', leagueId, 'thread', 'unread'], { unread: false })
    },
  })
}
