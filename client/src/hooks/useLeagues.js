import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useMyLeagues() {
  return useQuery({
    queryKey: ['leagues'],
    queryFn: () => api.get('/leagues'),
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
    mutationFn: ({ leagueId, picks, entryName }) =>
      api.post(`/leagues/${leagueId}/bracket/entry`, { picks, entry_name: entryName }),
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
