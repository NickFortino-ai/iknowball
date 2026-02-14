import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useMyInvitations(enabled = true) {
  return useQuery({
    queryKey: ['invitations'],
    queryFn: () => api.get('/users/me/invitations'),
    refetchInterval: 30_000,
    enabled,
  })
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (invitationId) => api.post(`/users/me/invitations/${invitationId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      queryClient.invalidateQueries({ queryKey: ['leagues'] })
    },
  })
}

export function useDeclineInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (invitationId) => api.post(`/users/me/invitations/${invitationId}/decline`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
    },
  })
}

export function useSearchUsers(query) {
  return useQuery({
    queryKey: ['users', 'search', query],
    queryFn: () => api.get(`/users/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 10_000,
  })
}

export function useSendInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leagueId, username }) =>
      api.post(`/leagues/${leagueId}/invitations`, { username }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leagues', variables.leagueId, 'invitations'] })
    },
  })
}

export function useLeagueInvitations(leagueId) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'invitations'],
    queryFn: () => api.get(`/leagues/${leagueId}/invitations`),
    enabled: !!leagueId,
  })
}
