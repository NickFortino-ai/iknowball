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

export function useReorderLeagues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (order) => api.patch('/leagues/reorder', { order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
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
    refetchInterval: 60000,
  })
}

export function useLeagueReport(leagueId) {
  return useQuery({
    queryKey: ['league-report', leagueId],
    queryFn: () => api.get(`/leagues/${leagueId}/report`),
    enabled: !!leagueId,
    staleTime: Infinity,
    retry: false,
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

export function useLeagueBackdrops(sport) {
  return useQuery({
    queryKey: ['league-backdrops', sport],
    queryFn: () => api.get(`/leagues/backdrops${sport ? `?sport=${sport}` : ''}`),
  })
}

export function useOpenLeagues() {
  return useQuery({
    queryKey: ['leagues', 'open'],
    queryFn: () => api.get('/leagues/open'),
  })
}

export function useJoinOpenLeague() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/join-open`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', 'open'] })
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

export function useSubmitTouchdownPick() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leagueId, weekId, playerId }) =>
      api.post(`/leagues/${leagueId}/survivor/touchdown-pick`, { week_id: weekId, player_id: playerId }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'survivor'] })
    },
  })
}

export function useTouchdownPlayers(leagueId, position, query) {
  const params = new URLSearchParams()
  if (position && position !== 'All') params.set('position', position)
  if (query) params.set('q', query)
  return useQuery({
    queryKey: ['leagues', leagueId, 'survivor', 'touchdown-players', position, query],
    queryFn: () => api.get(`/leagues/${leagueId}/survivor/touchdown-players?${params}`),
    enabled: !!leagueId,
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
    refetchInterval: (query) => {
      const board = query.state.data
      if (!board) return 5000
      if (!board.digits_locked) return 2000
      // Poll faster during live game for quarter score updates
      if (board.games?.status === 'live') return 10000
      if (board.digits_locked && board.games?.starts_at && new Date(board.games.starts_at) <= new Date() && board.games?.status !== 'final') return 10000
      return 30000
    },
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

export function useUnclaimSquare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, rowPos, colPos }) =>
      api.post(`/leagues/${leagueId}/squares/unclaim`, { row_pos: rowPos, col_pos: colPos }),
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

// ── Fantasy Football ──

export function useFantasySettings(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'settings'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/settings`),
    enabled: !!leagueId,
  })
}

export function useUpdateFantasySettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leagueId, ...patch }) => api.patch(`/leagues/${leagueId}/fantasy/settings`, patch),
    onSuccess: (_d, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'settings'] })
    },
  })
}

export function useDraftBoard(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'draft'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/draft`),
    enabled: !!leagueId,
    refetchInterval: 5000, // Poll during draft
  })
}

export function useFantasyRoster(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'roster'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/roster`),
    enabled: !!leagueId,
    refetchInterval: 60000,
  })
}

export function useSetFantasyLineup(leagueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (slots) => api.post(`/leagues/${leagueId}/fantasy/lineup`, { slots }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'roster'] })
    },
  })
}

export function useDropRosterPlayer(leagueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playerId) => api.delete(`/leagues/${leagueId}/fantasy/roster/${playerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'roster'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'players'] })
    },
  })
}

export function useAddDropPlayer(leagueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ addPlayerId, dropPlayerId }) =>
      api.post(`/leagues/${leagueId}/fantasy/add-drop`, { add_player_id: addPlayerId, drop_player_id: dropPlayerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'roster'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'players'] })
    },
  })
}

export function useFantasyTrades(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'trades'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/trades`),
    enabled: !!leagueId,
    refetchInterval: 60000,
  })
}

export function useProposeTrade(leagueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) => api.post(`/leagues/${leagueId}/fantasy/trades`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'trades'] }),
  })
}

export function useRespondToTrade(leagueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ tradeId, action }) => api.post(`/leagues/${leagueId}/fantasy/trades/${tradeId}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'trades'] })
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'roster'] })
    },
  })
}

export function useWaiverState(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'waivers', 'state'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/waivers/state`),
    enabled: !!leagueId,
  })
}

export function useMyWaiverClaims(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'waivers', 'claims'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/waivers/claims`),
    enabled: !!leagueId,
  })
}

export function useSubmitWaiverClaim(leagueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) => api.post(`/leagues/${leagueId}/fantasy/waivers/claims`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'waivers'] })
    },
  })
}

export function useCancelWaiverClaim(leagueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (claimId) => api.delete(`/leagues/${leagueId}/fantasy/waivers/claims/${claimId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'waivers'] })
    },
  })
}

export function usePlayerDetail(leagueId, playerId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'player-detail', playerId],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/players/${playerId}/detail`),
    enabled: !!leagueId && !!playerId,
    refetchInterval: 15000,
  })
}

export function useAvailablePlayers(leagueId, query, position) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (position) params.set('position', position)
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'players', query, position],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/players?${params}`),
    enabled: !!leagueId,
    staleTime: 10_000,
    refetchInterval: 120000,
  })
}

export function useInitDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/fantasy/draft/init`),
    onSuccess: (_data, leagueId) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy'] })
    },
  })
}

export function useStartDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/fantasy/draft/start`),
    onSuccess: (_data, leagueId) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy'] })
    },
  })
}

export function useMakeDraftPick() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leagueId, playerId }) => api.post(`/leagues/${leagueId}/fantasy/draft/pick`, { playerId }),
    onSuccess: (_data, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy'] })
    },
  })
}

export function useMakeOfflineDraftPick() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leagueId, playerId }) => api.post(`/leagues/${leagueId}/fantasy/draft/offline-pick`, { playerId }),
    onSuccess: (_data, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy'] })
    },
  })
}

export function usePauseDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/fantasy/draft/pause`),
    onSuccess: (_d, leagueId) => queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy'] }),
  })
}

export function useResumeDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/fantasy/draft/resume`),
    onSuccess: (_d, leagueId) => queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy'] }),
  })
}

export function useFantasyStandings(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'standings'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/standings`),
    enabled: !!leagueId,
    refetchInterval: 60000,
  })
}

export function useDraftPlayerDetail(leagueId, playerId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'draft-player-detail', playerId],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/draft-player-detail/${playerId}`),
    enabled: !!leagueId && !!playerId,
  })
}

export function useMockDraftPlayerDetail(playerId, scoring) {
  return useQuery({
    queryKey: ['mock-draft', 'player-detail', playerId, scoring],
    queryFn: () => api.get(`/mock-draft/players/${playerId}/detail?scoring=${encodeURIComponent(scoring || 'ppr')}`),
    enabled: !!playerId,
  })
}

export function useGlobalRank(leagueId, enabled = true) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'globalRank'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/global-rank`),
    enabled: !!leagueId && enabled,
  })
}

export function useMyRankings(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'myRankings'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/my-rankings`),
    enabled: !!leagueId,
  })
}

export function useSetMyRankings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leagueId, playerIds }) => api.put(`/leagues/${leagueId}/fantasy/my-rankings`, { playerIds }),
    onSuccess: (_d, { leagueId }) => queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'myRankings'] }),
  })
}

export function useResetMyRankings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leagueId) => api.post(`/leagues/${leagueId}/fantasy/my-rankings/reset`),
    onSuccess: (_d, leagueId) => queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'myRankings'] }),
  })
}

export function useDraftQueue(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'fantasy', 'draftQueue'],
    queryFn: () => api.get(`/leagues/${leagueId}/fantasy/draft/queue`),
    enabled: !!leagueId,
  })
}

export function useSetDraftQueue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leagueId, playerIds }) => api.put(`/leagues/${leagueId}/fantasy/draft/queue`, { playerIds }),
    onSuccess: (_data, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'draftQueue'] })
    },
  })
}

export function useRealtimeDraft(leagueId) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`fantasy-draft-${leagueId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'fantasy_draft_picks',
        filter: `league_id=eq.${leagueId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'draft'] })
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'fantasy', 'players'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, queryClient])
}

// ============================================
// NBA DFS
// ============================================

export function useNbaDfsPlayers(date) {
  return useQuery({
    queryKey: ['nba-dfs', 'players', date],
    queryFn: () => api.get(`/nba-dfs/players?date=${date}`),
    enabled: !!date,
    refetchInterval: (query) => {
      const hasLive = query.state.data?.some((p) => p.game_status === 'live')
      return hasLive ? 25000 : 120000
    },
  })
}

export function useNbaDfsRoster(leagueId, date, season = 2026) {
  return useQuery({
    queryKey: ['nba-dfs', leagueId, 'roster', date],
    queryFn: () => api.get(`/nba-dfs/roster?league_id=${leagueId}&date=${date}&season=${season}`),
    enabled: !!leagueId && !!date,
    refetchInterval: 60000, // refresh every 60s for live point updates
  })
}

export function useSaveNbaDfsRoster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/nba-dfs/roster', data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['nba-dfs', variables.league_id, 'roster'] })
    },
  })
}

export function useNbaDfsLive(leagueId, date, season = 2026) {
  return useQuery({
    queryKey: ['nba-dfs', leagueId, 'live', date],
    queryFn: () => api.get(`/nba-dfs/live?league_id=${leagueId}&date=${date}&season=${season}`),
    enabled: !!leagueId && !!date,
    refetchInterval: 30000, // 30 seconds
  })
}

export function useNbaDfsPlayerLookup(name, sport) {
  const sportParam = sport ? `&sport=${encodeURIComponent(sport)}` : ''
  return useQuery({
    queryKey: ['nba-dfs', 'player-lookup', name, sport],
    queryFn: () => api.get(`/nba-dfs/player/lookup?name=${encodeURIComponent(name)}${sportParam}`),
    enabled: !!name,
    staleTime: 10 * 60 * 1000,
  })
}

export function useNbaDfsPlayerGamelog(espnId, sport = 'basketball_nba') {
  return useQuery({
    queryKey: ['nba-dfs', 'gamelog', espnId, sport],
    queryFn: () => api.get(`/nba-dfs/player/${espnId}/gamelog?sport=${sport}`),
    enabled: !!espnId,
    staleTime: 5 * 60 * 1000, // cache for 5 min
  })
}

export function useNbaDfsStandings(leagueId) {
  return useQuery({
    queryKey: ['nba-dfs', leagueId, 'standings'],
    queryFn: () => api.get(`/nba-dfs/standings?league_id=${leagueId}`),
    enabled: !!leagueId,
    refetchInterval: 60000,
  })
}

// MLB DFS hooks
export function useMlbDfsPlayers(date) {
  return useQuery({
    queryKey: ['mlb-dfs', 'players', date],
    queryFn: () => api.get(`/mlb-dfs/players?date=${date}`),
    enabled: !!date,
    refetchInterval: (query) => {
      const hasLive = query.state.data?.some((p) => p.game_status === 'live')
      return hasLive ? 25000 : 120000
    },
  })
}

export function useMlbDfsRoster(leagueId, date, season = 2026) {
  return useQuery({
    queryKey: ['mlb-dfs', leagueId, 'roster', date],
    queryFn: () => api.get(`/mlb-dfs/roster?league_id=${leagueId}&date=${date}&season=${season}`),
    enabled: !!leagueId && !!date,
    refetchInterval: 60000,
  })
}

export function useSaveMlbDfsRoster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/mlb-dfs/roster', data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mlb-dfs', variables.league_id, 'roster'] })
    },
  })
}

export function useMlbDfsLive(leagueId, date) {
  return useQuery({
    queryKey: ['mlb-dfs', leagueId, 'live', date],
    queryFn: () => api.get(`/mlb-dfs/live?league_id=${leagueId}&date=${date}`),
    enabled: !!leagueId && !!date,
    refetchInterval: 30000,
  })
}

export function useNflDfsLive(leagueId, week, season) {
  return useQuery({
    queryKey: ['nfl-dfs', leagueId, 'live', week, season],
    queryFn: () => api.get(`/dfs/live?league_id=${leagueId}&week=${week}&season=${season}`),
    enabled: !!leagueId && !!week,
    // 5s during live games, 10s otherwise. People expect near-instant updates.
    refetchInterval: (query) => {
      const data = query.state.data
      const anyLive = data?.any_live || data?.members?.some((m) => m.slots?.some((s) => s.game_status === 'live'))
      return anyLive ? 5000 : 10000
    },
  })
}

export function useFantasyMatchupLive(leagueId, week, season) {
  return useQuery({
    queryKey: ['fantasy', leagueId, 'matchup-live', week, season],
    queryFn: () => api.get(`/dfs/matchup-live?league_id=${leagueId}&week=${week}&season=${season}`),
    enabled: !!leagueId && !!week,
    refetchInterval: (query) => {
      const data = query.state.data
      const anyLive = data?.matchups?.some((m) =>
        m.home_roster?.some((s) => s.game_status === 'live') ||
        m.away_roster?.some((s) => s.game_status === 'live')
      )
      return anyLive ? 5000 : 10000
    },
  })
}

export function useMlbDfsStandings(leagueId) {
  return useQuery({
    queryKey: ['mlb-dfs', leagueId, 'standings'],
    queryFn: () => api.get(`/mlb-dfs/standings?league_id=${leagueId}`),
    enabled: !!leagueId,
    refetchInterval: 60000,
  })
}

// HR Derby hooks
export function useHrDerbyPlayers(date) {
  return useQuery({
    queryKey: ['hr-derby', 'players', date],
    queryFn: () => api.get(`/hr-derby/players?date=${date}`),
    enabled: !!date,
  })
}

export function useHrDerbyPicks(leagueId, date) {
  return useQuery({
    queryKey: ['hr-derby', leagueId, 'picks', date],
    queryFn: () => api.get(`/hr-derby/picks?league_id=${leagueId}&date=${date}`),
    enabled: !!leagueId && !!date,
  })
}

export function useHrDerbyUsed(leagueId, date) {
  return useQuery({
    queryKey: ['hr-derby', leagueId, 'used', date],
    queryFn: () => api.get(`/hr-derby/used?league_id=${leagueId}&date=${date}`),
    enabled: !!leagueId && !!date,
  })
}

export function useSubmitHrDerbyPicks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/hr-derby/picks', data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hr-derby', variables.league_id] })
    },
  })
}

export function useHrDerbyStandings(leagueId) {
  return useQuery({
    queryKey: ['hr-derby', leagueId, 'standings'],
    queryFn: () => api.get(`/hr-derby/standings?league_id=${leagueId}`),
    enabled: !!leagueId,
    refetchInterval: 60000,
  })
}
